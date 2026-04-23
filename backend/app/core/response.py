"""Standardized API response helpers."""

from typing import Any

from pydantic import BaseModel


class ApiResponse(BaseModel):
    """Uniform envelope for every API response."""

    success: bool = True
    data: Any = None
    message: str = ""
    errors: list[Any] = []


def success_response(
    data: Any = None,
    message: str = "",
    status_code: int = 200,
) -> dict[str, Any]:
    """Build a successful response payload.

    Args:
        data: The response body payload.
        message: Optional human-readable message.
        status_code: HTTP status code (returned alongside the dict for convenience).

    Returns:
        Dictionary matching the ``ApiResponse`` schema.
    """
    return {
        "success": True,
        "data": data,
        "message": message,
        "errors": [],
    }


def error_response(
    message: str = "An error occurred",
    errors: list[Any] | None = None,
) -> dict[str, Any]:
    """Build an error response payload.

    Args:
        message: Human-readable error summary.
        errors: Detailed error list.

    Returns:
        Dictionary matching the ``ApiResponse`` schema.
    """
    return {
        "success": False,
        "data": None,
        "message": message,
        "errors": errors or [],
    }
