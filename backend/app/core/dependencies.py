"""FastAPI dependency injection utilities."""

from collections.abc import AsyncGenerator
from typing import Annotated

from jose import JWTError, ExpiredSignatureError
from fastapi import Depends, Header
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import ForbiddenError, UnauthorizedError
from app.core.security import decode_token
from app.db.session import async_session_factory

settings = get_settings()


# ---------------------------------------------------------------------------
# Database session
# ---------------------------------------------------------------------------

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async SQLAlchemy session, ensuring cleanup on exit."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# Current user resolution
# ---------------------------------------------------------------------------

async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
):
    """Extract and validate the JWT from the Authorization header, then load the user.

    Expects header format: ``Authorization: Bearer <token>``
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise UnauthorizedError("Missing or malformed Authorization header")

    token = authorization.removeprefix("Bearer ").strip()

    try:
        payload = decode_token(token)
    except ExpiredSignatureError:
        raise UnauthorizedError("Token has expired")
    except JWTError:
        raise UnauthorizedError("Invalid token")

    if payload.get("type") != "access":
        raise UnauthorizedError("Invalid token type; access token required")

    user_id = payload.get("sub")
    if user_id is None:
        raise UnauthorizedError("Token missing subject claim")

    # Lazy import to avoid circular dependency with models
    from app.models.user import User  # noqa: WPS433

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if user is None:
        raise UnauthorizedError("User not found")

    if not user.is_active:
        raise ForbiddenError("User account is deactivated")

    return user


# ---------------------------------------------------------------------------
# Role-based access control
# ---------------------------------------------------------------------------

class RoleChecker:
    """Dependency that verifies the current user holds one of the allowed roles.

    Usage::

        require_admin = RoleChecker(["admin"])

        @router.get("/admin-only", dependencies=[Depends(require_admin)])
        async def admin_endpoint(): ...
    """

    def __init__(self, allowed_roles: list[str]) -> None:
        self.allowed_roles = allowed_roles

    async def __call__(self, current_user=Depends(get_current_user)) -> None:
        if current_user.role not in self.allowed_roles:
            raise ForbiddenError(
                f"Role '{current_user.role}' is not authorised. "
                f"Required: {', '.join(self.allowed_roles)}"
            )


# Convenience permission guards
require_admin = RoleChecker(["admin"])
require_qa_head = RoleChecker(["admin", "qa_head"])
require_qa_engineer = RoleChecker(["admin", "qa_head", "qa_engineer"])
require_developer = RoleChecker(["admin", "qa_head", "qa_engineer", "developer"])
require_viewer = RoleChecker(["admin", "qa_head", "qa_engineer", "developer", "viewer"])
