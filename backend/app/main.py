"""FastAPI application entry point."""

import logging
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.api.routes import router as api_router
from app.core.config import get_settings
from app.core.exceptions import register_exception_handlers
from app.core.logging_config import setup_logging
from app.core.middleware import (
    AuditMiddleware,
    RateLimitMiddleware,
    SecurityHeadersMiddleware,
)
from app.core.response import success_response
from app.core.sentry import init_sentry
from app.db.migrate import ensure_columns
from app.db.session import engine

settings = get_settings()
logger = logging.getLogger(__name__)

# Initialise Sentry **before** FastAPI is constructed so the SDK's
# request-handling integration can patch in correctly. Dormant when
# SENTRY_DSN is unset — no outbound traffic, no overhead.
init_sentry(settings)


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Handle startup and shutdown lifecycle events."""
    setup_logging()
    await ensure_columns(engine)
    logger.info("application_startup", extra={"project": settings.PROJECT_NAME})
    yield
    # Shutdown: dispose of the async engine connection pool
    await engine.dispose()
    logger.info("application_shutdown")


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------

def create_app() -> FastAPI:
    """Build and configure the FastAPI application instance."""

    app = FastAPI(
        title=settings.PROJECT_NAME,
        openapi_url=f"{settings.API_V1_PREFIX}/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
        redirect_slashes=False,
    )

    # --- Exception handlers ---
    register_exception_handlers(app)

    # --- Middleware (execution order is bottom-to-top) ---
    app.add_middleware(AuditMiddleware)
    app.add_middleware(RateLimitMiddleware, rate_per_minute=settings.RATE_LIMIT_PER_MINUTE)
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # --- Routers ---
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    # --- Static file serving for uploads ---
    uploads_dir = os.path.join(os.path.dirname(__file__), "..", "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")

    # --- Health probes ---
    #
    # /livez  → "is the process up?" (no dependencies). Returns 200
    #           as long as the event loop is responsive. Used by k8s
    #           liveness probes and load balancers — failure here
    #           triggers a restart.
    #
    # /readyz → "is the app ready to serve traffic?" Pings the DB and
    #           reports any unconfigured-but-required setting. Used by
    #           k8s readiness probes — failure here just removes the
    #           pod from the service rotation, no restart.
    #
    # /health → kept as a backwards-compatible alias of /livez so any
    #           external monitor wired up before this split keeps
    #           working without redeploys.

    @app.get("/livez", tags=["health"])
    async def liveness() -> dict:
        return success_response(data={"status": "alive"}, message="OK")

    @app.get("/health", tags=["health"], include_in_schema=False)
    async def health_check_alias() -> dict:
        """Alias of /livez for backwards compatibility with older
        monitors / k8s manifests."""
        return success_response(data={"status": "healthy"}, message="OK")

    @app.get("/readyz", tags=["health"])
    async def readiness() -> JSONResponse:
        """Per-dependency readiness check. Returns 503 with a
        component-by-component breakdown when something is unhealthy
        so dashboards can show *which* dep is the problem."""
        checks: dict[str, dict] = {}
        all_ok = True

        # Database — a single round-trip SELECT 1 confirms the engine
        # is connected and the worker can answer queries.
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            checks["database"] = {"status": "ok"}
        except Exception as exc:  # noqa: BLE001 — error is reported to caller
            all_ok = False
            checks["database"] = {"status": "error", "error": str(exc)[:200]}

        # SECRET_KEY validation: in production we refuse to start with a
        # placeholder, but a misconfigured staging deploy can drift —
        # surface it here.
        problems = settings._secret_key_problems()
        if not settings.DEBUG and problems:
            all_ok = False
            checks["secret_key"] = {"status": "error", "errors": problems}
        else:
            checks["secret_key"] = {"status": "ok"}

        body = success_response(
            data={"status": "ready" if all_ok else "not_ready", "checks": checks},
            message="OK" if all_ok else "Not ready",
        )
        return JSONResponse(
            status_code=200 if all_ok else 503,
            content=body,
        )

    return app


app = create_app()
