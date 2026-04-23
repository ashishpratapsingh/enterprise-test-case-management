"""Custom ASGI / Starlette middleware for auditing, rate-limiting, and security headers."""

import json
import logging
import re
import time
from collections import defaultdict
from typing import Any

from jose import JWTError
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.core.config import get_settings
from app.core.security import decode_token

settings = get_settings()
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Audit middleware
# ---------------------------------------------------------------------------

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)

# Paths whose state-changing calls we don't persist to audit_logs (noisy or
# privacy-sensitive).
_AUDIT_SKIP_PREFIXES: tuple[str, ...] = (
    "/api/v1/audit",        # avoid feedback loops
    "/api/v1/reports",      # read-mostly (exports are benign)
    "/health",
    "/docs",
    "/redoc",
    "/openapi",
)

# Methods that represent state changes we want persisted.
_AUDITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Method → base action
_METHOD_ACTION = {
    "POST": "CREATE",
    "PUT": "UPDATE",
    "PATCH": "UPDATE",
    "DELETE": "DELETE",
}

# URL-path segment → canonical entity_type
_ENTITY_ALIASES = {
    "testcases": "test_case",
    "test-cases": "test_case",
    "testsuites": "test_suite",
    "test-suites": "test_suite",
    "testruns": "test_run",
    "test-runs": "test_run",
    "executions": "execution",
    "defects": "defect",
    "users": "user",
    "roles": "role",
    "projects": "project",
    "modules": "module",
    "releases": "release",
    "requirements": "requirement",
    "epics": "epic",
    "user-stories": "user_story",
    "user_stories": "user_story",
    "auth": "auth",
}


# Synthesized payloads for sub-actions whose handlers accept no (or trivial)
# body. Keyed by (entity_type, sub_action). Keeps audit rows informative even
# when the request body is empty.
_SUB_ACTION_PAYLOAD: dict[tuple[str, str], dict] = {
    ("user", "activate"): {"is_active": True},
    ("user", "deactivate"): {"is_active": False},
    ("test_run", "start"): {"status": "In Progress"},
    ("test_run", "complete"): {"status": "Completed"},
    ("test_run", "abort"): {"status": "Cancelled"},
    ("test_run", "block"): {"status": "Blocked"},
}


def _parse_audit_path(path: str) -> tuple[str | None, str | None, str | None]:
    """Derive (entity_type, entity_id, sub_action) from an /api/v1 URL path.

    Examples:
        /api/v1/testcases                           → ('test_case', None, None)
        /api/v1/testcases/<uuid>                    → ('test_case', <uuid>, None)
        /api/v1/testruns/<uuid>/start               → ('test_run', <uuid>, 'start')
        /api/v1/users/<uuid>/reset-password         → ('user', <uuid>, 'reset-password')
    """
    parts = [p for p in path.split("/") if p]
    if len(parts) < 3 or parts[0] != "api" or parts[1] != "v1":
        return None, None, None

    resource = parts[2]
    entity_type = _ENTITY_ALIASES.get(resource, resource)

    entity_id: str | None = None
    sub_action: str | None = None
    if len(parts) >= 4 and _UUID_RE.match(parts[3]):
        entity_id = parts[3]
        if len(parts) >= 5:
            sub_action = parts[4]
    elif len(parts) >= 4:
        # path like /api/v1/auth/login — treat last segment as sub-action
        sub_action = parts[3]
    return entity_type, entity_id, sub_action


def _user_from_auth(auth_header: str) -> str | None:
    """Decode the Bearer token (if any) and return the user_id, or None."""
    if not auth_header.startswith("Bearer "):
        return None
    try:
        payload = decode_token(auth_header.removeprefix("Bearer "))
        if payload.get("type") != "access":
            return None
        return payload.get("sub")
    except (JWTError, Exception):  # broad catch — middleware must never raise
        return None


def _safe_json(body: bytes) -> dict | None:
    """Parse a JSON body into a dict, stripping sensitive keys. None on failure."""
    if not body:
        return None
    try:
        data = json.loads(body)
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(data, dict):
        return None
    # Redact sensitive fields so they never hit the audit table.
    redacted = {}
    for k, v in data.items():
        if "password" in k.lower() or k.lower() in {"token", "refresh_token", "access_token"}:
            redacted[k] = "[redacted]"
        else:
            redacted[k] = v
    return redacted


class AuditMiddleware(BaseHTTPMiddleware):
    """Log every request and persist state-changing ones to audit_logs.

    For any audited mutation we snapshot the target row both before the handler
    runs (``old_values``) and after (``new_values``) so the audit drawer shows
    full before/after context — not just the request body.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        start = time.perf_counter()
        path = request.url.path
        method = request.method
        client_ip = request.client.host if request.client else "unknown"
        user_agent = request.headers.get("user-agent")

        # Extract user hint from Authorization header (without full decode)
        auth_header = request.headers.get("authorization", "")
        user_hint = f"bearer:...{auth_header[-8:]}" if auth_header.startswith("Bearer ") else "anonymous"

        logger.info(
            "request_started",
            extra={"client_ip": client_ip, "method": method, "path": path, "user_hint": user_hint},
        )

        # Capture body early (only for audited state-changing methods) so we can
        # record the request payload. We must replace the receive channel so the
        # downstream handler can still read the body.
        request_body: bytes = b""
        should_audit_path = (
            path.startswith("/api/v1/")
            and not any(path.startswith(p) for p in _AUDIT_SKIP_PREFIXES)
        )
        is_audited = method in _AUDITED_METHODS and should_audit_path

        if is_audited:
            try:
                request_body = await request.body()
            except Exception:
                request_body = b""

            async def receive() -> dict:  # type: ignore[override]
                return {"type": "http.request", "body": request_body, "more_body": False}

            request = Request(request.scope, receive)  # type: ignore[assignment]

        # Snapshot pre-state (must happen BEFORE call_next, otherwise DELETE
        # will no longer find the row).
        entity_type, entity_id, sub_action = (None, None, None)
        old_values: dict | None = None
        if is_audited:
            entity_type, entity_id, sub_action = _parse_audit_path(path)
            if entity_type and entity_id:
                try:
                    old_values = await self._snapshot(entity_type, entity_id)
                except Exception as exc:  # noqa: BLE001
                    logger.debug("audit_snapshot_pre_failed", extra={"error": str(exc)})

        response = await call_next(request)

        # For audited + successful requests, buffer the response body so we can
        # (a) parse it for a newly-created id and (b) re-emit it downstream.
        response_body: bytes = b""
        if is_audited and 200 <= response.status_code < 400:
            try:
                chunks: list[bytes] = []
                async for chunk in response.body_iterator:
                    chunks.append(chunk)
                response_body = b"".join(chunks)
                # Recreate the response so downstream can still read it.
                response = Response(
                    content=response_body,
                    status_code=response.status_code,
                    headers={
                        k: v for k, v in response.headers.items()
                        if k.lower() not in {"content-length", "content-encoding"}
                    },
                    media_type=response.media_type,
                )
            except Exception as exc:  # noqa: BLE001
                logger.debug("audit_response_buffer_failed", extra={"error": str(exc)})

        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        logger.info(
            "request_completed",
            extra={
                "client_ip": client_ip,
                "method": method,
                "path": path,
                "status_code": response.status_code,
                "duration_ms": duration_ms,
                "user_hint": user_hint,
            },
        )

        # Persist audit log for successful state-changing requests. Run as a
        # fire-and-forget task so the main request's session has time to finish
        # its own commit before the audit write opens a new session (avoids
        # SQLite "database is locked" under the default journal config).
        if is_audited and 200 <= response.status_code < 400:
            import asyncio

            # Snapshot: capture local context so the coroutine doesn't close over
            # mutable locals.
            captured_old = old_values
            captured_type = entity_type
            captured_id = entity_id
            captured_sub = sub_action
            captured_response_body = response_body

            async def _deferred_persist() -> None:
                try:
                    await self._persist(
                        method=method,
                        path=path,
                        status_code=response.status_code,
                        auth_header=auth_header,
                        request_body=request_body,
                        response_body=captured_response_body,
                        client_ip=client_ip,
                        user_agent=user_agent,
                        entity_type=captured_type,
                        entity_id=captured_id,
                        sub_action=captured_sub,
                        old_values=captured_old,
                    )
                except Exception as exc:  # noqa: BLE001 — auditing must never break requests
                    logger.warning("audit_persist_failed", extra={"error": str(exc), "path": path})

            asyncio.create_task(_deferred_persist())

        return response

    async def _snapshot(self, entity_type: str, entity_id: str) -> dict | None:
        """Open a transient session and snapshot the entity, swallowing errors."""
        from app.db.session import async_session_factory
        from app.services.audit_snapshot import snapshot_entity

        async with async_session_factory() as session:
            try:
                return await snapshot_entity(session, entity_type, entity_id)
            except Exception:
                return None

    async def _persist(
        self,
        *,
        method: str,
        path: str,
        status_code: int,
        auth_header: str,
        request_body: bytes,
        response_body: bytes,
        client_ip: str,
        user_agent: str | None,
        entity_type: str | None,
        entity_id: str | None,
        sub_action: str | None,
        old_values: dict | None,
    ) -> None:
        """Insert a row into audit_logs for the current request."""
        if entity_type is None:
            return

        action = _METHOD_ACTION[method]
        if method == "POST" and sub_action and not (entity_id is None and sub_action in {"login", "register", "refresh"}):
            # e.g. /users/{id}/activate → action = ACTIVATE
            action = sub_action.upper().replace("-", "_")
        elif method == "POST" and sub_action in {"login", "logout", "register"}:
            action = sub_action.upper()

        user_id = _user_from_auth(auth_header)

        # Auth endpoints (login/register/refresh) — user id may be absent.
        # We still log them for the audit trail; skip when we can't associate.
        if user_id is None:
            return

        # For a freshly-created resource (POST on a collection), the new id is
        # in the response body under data.id. Pull it so we can snapshot the
        # created record.
        created_id: str | None = None
        if method == "POST" and entity_id is None and response_body:
            try:
                resp = json.loads(response_body)
                data = resp.get("data") if isinstance(resp, dict) else None
                if isinstance(data, dict):
                    created_id = data.get("id")
                elif isinstance(data, list) and data and isinstance(data[0], dict):
                    # batch create — use first
                    created_id = data[0].get("id")
            except (ValueError, UnicodeDecodeError, AttributeError):
                pass

        # Determine the id we'll snapshot for the new state.
        post_id = entity_id or created_id

        # Load the fresh DB snapshot AFTER the handler has committed.
        new_values: dict | None = None
        if method != "DELETE" and post_id:
            try:
                new_values = await self._snapshot(entity_type, post_id)
            except Exception:
                new_values = None

        # Merge/fallback: if we still have nothing, use the sanitised request
        # body (POST without id lookup, or when the snapshot failed).
        if new_values is None and method in {"POST", "PUT", "PATCH"}:
            body_data = _safe_json(request_body)
            if body_data:
                new_values = body_data

        # Synthesize a payload for body-less sub-actions if neither of the
        # above gave us anything (or as a supplement to the snapshot via an
        # explicit "state change" marker in new_values).
        if not new_values and sub_action and entity_id is not None:
            synthesized = _SUB_ACTION_PAYLOAD.get((entity_type, sub_action))
            if synthesized is not None:
                new_values = dict(synthesized)

        # For DELETE, new_values stays None; old_values already holds the
        # full record that was removed.
        if new_values is None and method == "DELETE" and old_values is None and entity_id is not None:
            new_values = {"deleted": True}

        # Use the created id as entity_id when the route was a collection POST.
        effective_entity_id = entity_id or created_id

        # Late imports to avoid circular dependencies at module load time.
        from app.db.session import async_session_factory
        from app.services.audit_service import AuditService

        async with async_session_factory() as session:
            try:
                svc = AuditService(session)
                await svc.log_action(
                    entity_type=entity_type,
                    entity_id=effective_entity_id,
                    action=action,
                    user_id=user_id,
                    old_values=old_values,
                    new_values=new_values,
                    ip_address=client_ip,
                    user_agent=user_agent[:500] if user_agent else None,
                )
                await session.commit()
            except Exception:
                await session.rollback()
                raise


# ---------------------------------------------------------------------------
# Rate-limit middleware (token-bucket per IP)
# ---------------------------------------------------------------------------

class _TokenBucket:
    """Simple token-bucket rate limiter."""

    __slots__ = ("capacity", "refill_rate", "tokens", "last_refill")

    def __init__(self, capacity: int, refill_rate: float) -> None:
        self.capacity = capacity
        self.refill_rate = refill_rate  # tokens per second
        self.tokens = float(capacity)
        self.last_refill = time.monotonic()

    def consume(self) -> bool:
        now = time.monotonic()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        self.last_refill = now

        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-IP token-bucket rate limiter."""

    def __init__(self, app: Any, rate_per_minute: int = settings.RATE_LIMIT_PER_MINUTE) -> None:
        super().__init__(app)
        self.rate_per_minute = rate_per_minute
        self.buckets: dict[str, _TokenBucket] = defaultdict(
            lambda: _TokenBucket(
                capacity=rate_per_minute,
                refill_rate=rate_per_minute / 60.0,
            )
        )

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        client_ip = request.client.host if request.client else "unknown"
        bucket = self.buckets[client_ip]

        if not bucket.consume():
            logger.warning("rate_limit_exceeded", extra={"client_ip": client_ip})
            return JSONResponse(
                status_code=429,
                content={
                    "success": False,
                    "data": None,
                    "message": "Rate limit exceeded. Please try again later.",
                    "errors": [],
                },
            )

        return await call_next(request)


# ---------------------------------------------------------------------------
# Security headers middleware
# ---------------------------------------------------------------------------

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inject security-related HTTP response headers."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Content-Security-Policy"] = "default-src 'self'"
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"

        return response
