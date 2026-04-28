"""Role management routes.

Listing is open to any authenticated user (the catalog drives dropdowns).
Create / update / delete require the admin role.

Soft-delete a role only succeeds if no active user is still assigned to
it; otherwise the API returns 409. This prevents accidentally orphaning
existing users from their permission scope.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    RoleChecker,
    get_current_user,
    get_db,
    success_response,
)
from app.core.exceptions import ConflictError, NotFoundError
from app.models.role import Role
from app.models.user import User
from app.schemas.user import RoleCreate, RoleResponse, RoleUpdate

router = APIRouter(prefix="/roles", tags=["Roles"])


def _serialize(role: Role) -> dict:
    return RoleResponse.model_validate(role).model_dump(mode="json")


@router.get(
    "",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List roles",
)
async def list_roles(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Return all defined roles (any authenticated user can see the catalog)."""
    stmt = (
        select(Role)
        .where(Role.is_deleted == False)  # noqa: E712
        .order_by(Role.name.asc())
    )
    result = await db.execute(stmt)
    roles = result.scalars().all()
    return success_response(
        data=[_serialize(r) for r in roles],
        message="Roles retrieved successfully",
    )


@router.post(
    "",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Create a role (admin only)",
)
async def create_role(
    payload: RoleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(allowed_roles=["admin"])),
) -> dict:
    # Reject duplicate names.
    existing = (
        await db.execute(select(Role).where(Role.name == payload.name))
    ).scalar_one_or_none()
    if existing is not None and not existing.is_deleted:
        raise ConflictError(f"A role named '{payload.name}' already exists")

    role = Role(
        id=str(uuid.uuid4()),
        name=payload.name,
        description=payload.description,
        permissions=payload.permissions,
    )
    db.add(role)
    await db.flush()
    await db.refresh(role)
    return success_response(data=_serialize(role), message="Role created")


@router.put(
    "/{role_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Update a role (admin only)",
)
async def update_role(
    role_id: str,
    payload: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(allowed_roles=["admin"])),
) -> dict:
    role = (
        await db.execute(select(Role).where(Role.id == role_id))
    ).scalar_one_or_none()
    if role is None or role.is_deleted:
        raise NotFoundError(f"Role '{role_id}' not found")

    if payload.name is not None and payload.name != role.name:
        clash = (
            await db.execute(
                select(Role).where(Role.name == payload.name, Role.id != role.id)
            )
        ).scalar_one_or_none()
        if clash is not None and not clash.is_deleted:
            raise ConflictError(
                f"A role named '{payload.name}' already exists"
            )
        role.name = payload.name

    if payload.description is not None:
        role.description = payload.description
    if payload.permissions is not None:
        role.permissions = payload.permissions

    await db.flush()
    await db.refresh(role)
    return success_response(data=_serialize(role), message="Role updated")


@router.delete(
    "/{role_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Soft-delete a role (admin only)",
)
async def delete_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(allowed_roles=["admin"])),
) -> dict:
    role = (
        await db.execute(select(Role).where(Role.id == role_id))
    ).scalar_one_or_none()
    if role is None or role.is_deleted:
        raise NotFoundError(f"Role '{role_id}' not found")

    # Block deletion if any active user still references this role —
    # otherwise their JWTs would resolve to a soft-deleted role and the
    # role-checker would silently fail open.
    user_count = (
        await db.execute(
            select(func.count())
            .select_from(User)
            .where(User.role_id == role.id, User.is_deleted == False)  # noqa: E712
        )
    ).scalar_one()
    if user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot delete role '{role.name}': "
                f"{user_count} user(s) are still assigned to it. "
                "Reassign them first."
            ),
        )

    role.is_deleted = True
    await db.flush()
    return success_response(data=_serialize(role), message="Role deleted")
