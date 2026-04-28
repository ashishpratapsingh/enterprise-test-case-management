"""Custom exception classes and FastAPI exception handlers."""

from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


# ---------------------------------------------------------------------------
# Custom exception hierarchy
# ---------------------------------------------------------------------------

class AppException(Exception):
    """Base application exception."""

    def __init__(
        self,
        message: str = "An unexpected error occurred",
        status_code: int = 500,
        errors: list[Any] | None = None,
    ) -> None:
        self.message = message
        self.status_code = status_code
        self.errors = errors or []
        super().__init__(self.message)


class NotFoundError(AppException):
    """Resource not found (HTTP 404)."""

    def __init__(self, message: str = "Resource not found", errors: list[Any] | None = None) -> None:
        super().__init__(message=message, status_code=404, errors=errors)


class UnauthorizedError(AppException):
    """Authentication required or failed (HTTP 401)."""

    def __init__(self, message: str = "Authentication required", errors: list[Any] | None = None) -> None:
        super().__init__(message=message, status_code=401, errors=errors)


class ForbiddenError(AppException):
    """Insufficient permissions (HTTP 403)."""

    def __init__(self, message: str = "Insufficient permissions", errors: list[Any] | None = None) -> None:
        super().__init__(message=message, status_code=403, errors=errors)


class ValidationError(AppException):
    """Request validation error (HTTP 422)."""

    def __init__(self, message: str = "Validation error", errors: list[Any] | None = None) -> None:
        super().__init__(message=message, status_code=422, errors=errors)


class ConflictError(AppException):
    """Conflicting resource state (HTTP 409)."""

    def __init__(self, message: str = "Resource conflict", errors: list[Any] | None = None) -> None:
        super().__init__(message=message, status_code=409, errors=errors)


class IntegrationError(AppException):
    """Outbound integration failure (HTTP 502 — Bad Gateway).

    Raised when a third-party service like JIRA / Bitbucket / a mail
    relay returns a non-success response or is unreachable. The
    message intentionally avoids leaking the upstream's verbatim
    response so we don't echo internal hostnames or tokens back to
    the API caller.
    """

    def __init__(
        self,
        message: str = "Upstream integration error",
        errors: list[Any] | None = None,
    ) -> None:
        super().__init__(message=message, status_code=502, errors=errors)


# ---------------------------------------------------------------------------
# FastAPI exception handlers
# ---------------------------------------------------------------------------

async def app_exception_handler(_request: Request, exc: AppException) -> JSONResponse:
    """Handle all custom AppException subclasses."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "data": None,
            "message": exc.message,
            "errors": exc.errors,
        },
    )


async def unhandled_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unhandled exceptions in production."""
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "data": None,
            "message": "Internal server error",
            "errors": [str(exc)],
        },
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Register all custom exception handlers on the FastAPI app."""
    app.add_exception_handler(AppException, app_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)
