"""Shared API dependencies for dependency injection."""

from typing import Annotated

from jose import JWTError, ExpiredSignatureError
from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select

from app.core.config import get_settings
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import decode_token
from app.db.session import get_session
from app.models.role import Role

settings = get_settings()


async def get_db() -> AsyncSession:
    """Yield an async database session."""
    async for session in get_session():
        yield session


async def get_current_user(
    authorization: Annotated[str, Header()],
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Extract and validate the current user from the Authorization header.

    Returns a dict with user info decoded from the JWT token.
    In a full implementation, this would also load the user from the database.
    """
    if not authorization.startswith("Bearer "):
        raise UnauthorizedError("Invalid authorization header format")

    token = authorization.removeprefix("Bearer ")
    try:
        payload = decode_token(token)
    except ExpiredSignatureError:
        raise UnauthorizedError("Token has expired")
    except JWTError:
        raise UnauthorizedError("Invalid token")

    if payload.get("type") != "access":
        raise UnauthorizedError("Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise UnauthorizedError("Invalid token payload")

    # Look up role name from the role_id in the JWT
    role_name = ""
    role_id = payload.get("role_id")
    if role_id:
        result = await db.execute(select(Role.name).where(Role.id == role_id))
        role_row = result.scalar_one_or_none()
        if role_row:
            role_name = role_row.lower().replace(" ", "_")

    return {
        "id": user_id,
        "role": role_name,
        "email": payload.get("email", ""),
    }


class RoleChecker:
    """Dependency that checks whether the current user has one of the allowed roles."""

    def __init__(self, allowed_roles: list[str]) -> None:
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: dict = Depends(get_current_user)) -> dict:
        if current_user.get("role") not in self.allowed_roles:
            raise ForbiddenError(
                f"Role '{current_user.get('role')}' is not authorized. "
                f"Required: {', '.join(self.allowed_roles)}"
            )
        return current_user


def success_response(data: object = None, message: str = "Success") -> dict:
    """Build a standardized success response envelope."""
    return {
        "success": True,
        "data": data,
        "message": message,
        "errors": [],
    }


def error_response(
    message: str = "An error occurred", errors: list | None = None
) -> dict:
    """Build a standardized error response envelope."""
    return {
        "success": False,
        "data": None,
        "message": message,
        "errors": errors or [],
    }
