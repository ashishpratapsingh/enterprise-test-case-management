"""Role management routes (read-only listing)."""

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, success_response
from app.models.role import Role
from app.schemas.user import RoleResponse

router = APIRouter(prefix="/roles", tags=["Roles"])


@router.get("", response_model=None, status_code=status.HTTP_200_OK, summary="List roles")
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return all defined roles (any authenticated user can see the catalog)."""
    stmt = select(Role).where(Role.is_deleted == False).order_by(Role.name.asc())  # noqa: E712
    result = await db.execute(stmt)
    roles = result.scalars().all()
    data = [RoleResponse.model_validate(r).model_dump(mode="json") for r in roles]
    return success_response(data=data, message="Roles retrieved successfully")
