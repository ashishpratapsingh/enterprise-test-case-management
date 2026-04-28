"""OIDC / SSO service.

Generic OpenID-Connect client that works with any standards-compliant
IdP — Okta, Azure AD, Google, Keycloak, Auth0, etc. The flow:

1. ``GET /auth/sso/login`` → we generate a signed ``state`` (CSRF token)
   and redirect the browser to the IdP's authorization endpoint.
2. IdP authenticates the user and redirects back to
   ``GET /auth/sso/callback?code=...&state=...``.
3. We verify the state, exchange the code for tokens at the IdP's
   token endpoint, fetch the userinfo, find or create the matching
   ``User`` row, and issue our own access + refresh JWTs.

The discovery document is fetched once per process and cached — its
endpoints and JWKS rarely change. We **don't** verify the ID token's
signature against JWKS in V1: we only trust user identity from the
userinfo endpoint, which already requires a valid access token issued
by the IdP. That's the standard "OIDC simple" pattern and matches
what most internal-tool implementations do.
"""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import IntegrationError, UnauthorizedError, ValidationError
from app.core.security import create_access_token, create_refresh_token
from app.models.role import Role
from app.models.user import User

logger = logging.getLogger(__name__)

# Short TTL for the state token: just long enough for the IdP round
# trip. If the user takes longer than this to complete login, we
# expire to bound replay risk.
_STATE_TTL_SECONDS = 300

# How long a discovery doc stays cached. Endpoints rarely change.
_DISCOVERY_TTL_SECONDS = 3600

_HTTP_TIMEOUT_SECONDS = 10.0


class SSOService:
    """OIDC client tied to a session for user lookup / provisioning."""

    # Process-wide discovery cache: { discovery_url: (fetched_at, doc) }
    _discovery_cache: dict[str, tuple[datetime, dict[str, Any]]] = {}

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.settings = get_settings()

    # ── Configuration guards ─────────────────────────────────────────────

    def is_configured(self) -> bool:
        s = self.settings
        return bool(s.OIDC_DISCOVERY_URL and s.OIDC_CLIENT_ID and s.OIDC_CLIENT_SECRET)

    def _ensure_configured(self) -> None:
        if not self.is_configured():
            raise ValidationError(
                "SSO is not configured. Set OIDC_DISCOVERY_URL, "
                "OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET env vars."
            )

    def _redirect_uri(self) -> str:
        """Where the IdP sends the user back. Falls back to
        ``{APP_BASE_URL}/api/v1/auth/sso/callback`` so a single env var
        (APP_BASE_URL) drives both email links and the SSO redirect."""
        if self.settings.OIDC_REDIRECT_URI:
            return self.settings.OIDC_REDIRECT_URI
        base = self.settings.APP_BASE_URL.rstrip("/")
        return f"{base}/api/v1/auth/sso/callback"

    # ── Discovery ────────────────────────────────────────────────────────

    async def _discover(self) -> dict[str, Any]:
        """Fetch the IdP's well-known configuration. Cached per
        discovery URL for an hour — endpoints don't change often."""
        url = self.settings.OIDC_DISCOVERY_URL or ""
        cached = self._discovery_cache.get(url)
        now = datetime.now(timezone.utc)
        if cached and (now - cached[0]).total_seconds() < _DISCOVERY_TTL_SECONDS:
            return cached[1]
        try:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
                resp = await client.get(url)
        except httpx.HTTPError as e:
            logger.warning("oidc_discovery_transport_error", extra={"err": str(e)})
            raise IntegrationError("Could not reach the SSO provider") from e
        if resp.status_code >= 300:
            logger.warning(
                "oidc_discovery_failed",
                extra={"status_code": resp.status_code, "body_preview": resp.text[:500]},
            )
            raise IntegrationError(
                f"SSO discovery returned HTTP {resp.status_code}"
            )
        doc = resp.json()
        for required in ("authorization_endpoint", "token_endpoint", "userinfo_endpoint"):
            if not doc.get(required):
                raise IntegrationError(
                    f"SSO discovery doc missing required field '{required}'"
                )
        self._discovery_cache[url] = (now, doc)
        return doc

    # ── State (CSRF) helpers ─────────────────────────────────────────────

    def _make_state(self, return_to: str | None = None) -> str:
        """Sign a short-lived state token with our SECRET_KEY. Carries
        a per-request nonce + optional return URL so we can bounce the
        user back to the page they tried to reach."""
        now = datetime.now(timezone.utc)
        payload = {
            "iat": now,
            "exp": now + timedelta(seconds=_STATE_TTL_SECONDS),
            "nonce": secrets.token_urlsafe(16),
            "type": "oidc_state",
        }
        if return_to:
            payload["return_to"] = return_to
        return jwt.encode(
            payload, self.settings.SECRET_KEY, algorithm=self.settings.ALGORITHM
        )

    def _verify_state(self, state: str) -> dict[str, Any]:
        try:
            payload = jwt.decode(
                state,
                self.settings.SECRET_KEY,
                algorithms=[self.settings.ALGORITHM],
            )
        except JWTError as e:
            raise UnauthorizedError("Invalid SSO state — possible CSRF attempt") from e
        if payload.get("type") != "oidc_state":
            raise UnauthorizedError("Invalid SSO state — wrong token type")
        return payload

    # ── Step 1: build the authorize URL ──────────────────────────────────

    async def begin_login(self, return_to: str | None = None) -> str:
        """Build the IdP authorization URL. Caller redirects the
        browser to this URL."""
        self._ensure_configured()
        doc = await self._discover()
        state = self._make_state(return_to=return_to)
        params = {
            "response_type": "code",
            "client_id": self.settings.OIDC_CLIENT_ID,
            "redirect_uri": self._redirect_uri(),
            "scope": self.settings.OIDC_SCOPES,
            "state": state,
        }
        # Use httpx.URL to safely encode params.
        return str(httpx.URL(doc["authorization_endpoint"]).copy_merge_params(params))

    # ── Step 2: handle the callback ──────────────────────────────────────

    async def handle_callback(self, code: str, state: str) -> dict[str, Any]:
        """Verify state → exchange code for tokens → fetch userinfo →
        find/create user → issue our JWTs. Returns the same shape as
        ``AuthService.login``."""
        self._ensure_configured()
        if not code or not state:
            raise ValidationError("code and state are required")

        state_payload = self._verify_state(state)
        return_to = state_payload.get("return_to")

        doc = await self._discover()
        tokens = await self._exchange_code(doc["token_endpoint"], code)
        access_token = tokens.get("access_token")
        if not access_token:
            raise IntegrationError("SSO provider did not return an access_token")

        userinfo = await self._fetch_userinfo(doc["userinfo_endpoint"], access_token)
        email = (userinfo.get("email") or "").strip().lower()
        if not email:
            raise ValidationError(
                "SSO provider did not return an email — cannot match or "
                "create a user. Check that the 'email' scope is requested."
            )
        full_name = (
            userinfo.get("name")
            or " ".join(filter(None, [userinfo.get("given_name"), userinfo.get("family_name")]))
            or email
        )

        user = await self._find_or_provision_user(email=email, full_name=full_name)

        access = create_access_token(
            subject=str(user.id),
            extra_claims={"role_id": str(user.role_id)},
        )
        refresh = create_refresh_token(subject=str(user.id))
        return {
            "access_token": access,
            "refresh_token": refresh,
            "token_type": "bearer",
            "user_id": str(user.id),
            "return_to": return_to,
        }

    async def _exchange_code(self, token_endpoint: str, code: str) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
                resp = await client.post(
                    token_endpoint,
                    data={
                        "grant_type": "authorization_code",
                        "code": code,
                        "redirect_uri": self._redirect_uri(),
                        "client_id": self.settings.OIDC_CLIENT_ID,
                        "client_secret": self.settings.OIDC_CLIENT_SECRET,
                    },
                    headers={"Accept": "application/json"},
                )
        except httpx.HTTPError as e:
            logger.warning("oidc_token_transport_error", extra={"err": str(e)})
            raise IntegrationError("Could not reach the SSO provider") from e
        if resp.status_code >= 300:
            logger.warning(
                "oidc_token_failed",
                extra={"status_code": resp.status_code, "body_preview": resp.text[:500]},
            )
            raise IntegrationError(
                f"SSO token exchange returned HTTP {resp.status_code}"
            )
        return resp.json()

    async def _fetch_userinfo(self, userinfo_endpoint: str, access_token: str) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS) as client:
                resp = await client.get(
                    userinfo_endpoint,
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/json",
                    },
                )
        except httpx.HTTPError as e:
            logger.warning("oidc_userinfo_transport_error", extra={"err": str(e)})
            raise IntegrationError("Could not reach the SSO provider") from e
        if resp.status_code >= 300:
            logger.warning(
                "oidc_userinfo_failed",
                extra={"status_code": resp.status_code, "body_preview": resp.text[:500]},
            )
            raise IntegrationError(
                f"SSO userinfo returned HTTP {resp.status_code}"
            )
        return resp.json()

    # ── User lookup / auto-provision ─────────────────────────────────────

    async def _find_or_provision_user(self, *, email: str, full_name: str) -> User:
        """Match by email (case-insensitive). If absent and
        ``OIDC_DEFAULT_ROLE_NAME`` is set, create the user with that
        role. Otherwise reject the login."""
        # Lookup is case-insensitive — Okta and Azure tend to
        # capitalise inconsistently.
        result = await self.session.execute(
            select(User).where(User.email.ilike(email), User.is_deleted == False)  # noqa: E712
        )
        user = result.scalar_one_or_none()
        if user is not None:
            if not user.is_active:
                raise UnauthorizedError("Your account is deactivated")
            return user

        default_role_name = (self.settings.OIDC_DEFAULT_ROLE_NAME or "").strip()
        if not default_role_name:
            raise UnauthorizedError(
                "No matching account, and auto-provisioning is disabled. "
                "Ask an admin to create your account first."
            )

        role_result = await self.session.execute(
            select(Role).where(Role.name == default_role_name)
        )
        role = role_result.scalar_one_or_none()
        if role is None:
            raise IntegrationError(
                f"OIDC_DEFAULT_ROLE_NAME='{default_role_name}' does not match "
                f"any role in the database. Either change the env var or "
                f"create that role."
            )

        # Auto-provisioned users have no usable password: store a
        # random hash they can never know. They can later set one via
        # the password-reset flow if they want to log in without SSO.
        from app.core.security import get_password_hash

        new_user = User(
            id=str(uuid.uuid4()),
            email=email,
            hashed_password=get_password_hash(secrets.token_urlsafe(32)),
            full_name=full_name,
            role_id=role.id,
            is_active=True,
        )
        self.session.add(new_user)
        await self.session.flush()
        logger.info(
            "oidc_user_provisioned",
            extra={"email": email, "role": default_role_name},
        )
        return new_user
