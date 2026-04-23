"""FastAPI application entry point."""

import logging
import os
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

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
from app.db.migrate import ensure_columns
from app.db.session import engine

settings = get_settings()
logger = logging.getLogger(__name__)


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

    # --- Health check ---
    @app.get("/health", tags=["health"])
    async def health_check() -> dict:
        """Lightweight health probe for load balancers and orchestrators."""
        return success_response(data={"status": "healthy"}, message="OK")

    return app


app = create_app()
