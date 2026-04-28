"""User management routes (admin-scoped CRUD, self-service password change)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    RoleChecker,
    get_current_user,
    get_db,
    success_response,
)
from app.schemas.user import (
    PasswordChange,
    PasswordReset,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["Users"])


# ── Bulk operation schemas ─────────────────────────────────────────────────


class _BulkIds(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500, description="User IDs")


class _BulkSetActive(_BulkIds):
    is_active: bool = Field(description="True to activate, false to deactivate")


class _BulkSetRole(_BulkIds):
    role_id: str = Field(min_length=1, description="Target role ID")


# Admin-only access for the lifecycle / destructive endpoints.
# qa_head can read but not mutate.
_ReadAccess = RoleChecker(allowed_roles=["admin", "qa_head"])
_AdminOnly = RoleChecker(allowed_roles=["admin"])


def _serialize(user: Any) -> dict:
    """Build the user response dict including role_name from the relationship."""
    role_name = user.role.name if getattr(user, "role", None) else ""
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role_id=user.role_id,
        role_name=role_name,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
    ).model_dump(mode="json")


# ── List / get ────────────────────────────────────────────────────────────

@router.get("", response_model=None, status_code=status.HTTP_200_OK, summary="List users")
async def list_users(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    search: str | None = Query(default=None, description="Search by name or email"),
    is_active: bool | None = Query(default=None),
    role_id: str | None = Query(default=None, description="Filter by role UUID"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(_ReadAccess),
) -> dict:
    """List users with pagination, search, and filtering. Admin + QA Head only."""
    service = UserService(db)
    users, total = await service.list_users(
        page=page,
        page_size=page_size,
        search=search,
        is_active=is_active,
        role_id=role_id,
    )
    items = [_serialize(u) for u in users]
    return success_response(
        data=[items, total],
        message="Users retrieved successfully",
    )


@router.get("/me", response_model=None, status_code=status.HTTP_200_OK, summary="Get current user")
async def get_me(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get the currently authenticated user's profile."""
    service = UserService(db)
    user = await service.get_user(user_id=current_user["id"])
    return success_response(data=_serialize(user), message="Profile retrieved successfully")


@router.get("/{user_id}", response_model=None, status_code=status.HTTP_200_OK, summary="Get user by ID")
async def get_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get a specific user by their UUID."""
    service = UserService(db)
    user = await service.get_user(user_id=user_id)
    return success_response(data=_serialize(user), message="User retrieved successfully")


# ── Create / update / delete (admin) ──────────────────────────────────────

@router.post("", response_model=None, status_code=status.HTTP_201_CREATED, summary="Create user")
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(_AdminOnly),
) -> dict:
    """Create a new user. Admin only."""
    service = UserService(db)
    user = await service.create_user(body.model_dump(mode="python"))
    return success_response(data=_serialize(user), message="User created successfully")


@router.put("/{user_id}", response_model=None, status_code=status.HTTP_200_OK, summary="Update user")
async def update_user(
    user_id: str,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(_AdminOnly),
) -> dict:
    """Update user profile fields. Admin only."""
    service = UserService(db)
    data = {k: v for k, v in body.model_dump(mode="python").items() if v is not None}
    user = await service.update_user(user_id=user_id, data=data)
    return success_response(data=_serialize(user), message="User updated successfully")


@router.delete("/{user_id}", response_model=None, status_code=status.HTTP_200_OK, summary="Delete user")
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(_AdminOnly),
) -> dict:
    """Soft-delete a user. Admin cannot delete themselves."""
    service = UserService(db)
    await service.delete_user(user_id=user_id, requested_by=current_user["id"])
    return success_response(message="User deleted successfully")


# ── Activation lifecycle ──────────────────────────────────────────────────

@router.post("/{user_id}/activate", response_model=None, status_code=status.HTTP_200_OK, summary="Activate user")
async def activate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(_AdminOnly),
) -> dict:
    service = UserService(db)
    user = await service.set_active(user_id, True)
    return success_response(data=_serialize(user), message="User activated successfully")


@router.post("/{user_id}/deactivate", response_model=None, status_code=status.HTTP_200_OK, summary="Deactivate user")
async def deactivate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(_AdminOnly),
) -> dict:
    service = UserService(db)
    user = await service.set_active(user_id, False, requested_by=current_user["id"])
    return success_response(data=_serialize(user), message="User deactivated successfully")


# ── Password management ───────────────────────────────────────────────────

@router.post("/{user_id}/reset-password", response_model=None, status_code=status.HTTP_200_OK, summary="Admin reset password")
async def reset_password(
    user_id: str,
    body: PasswordReset,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(_AdminOnly),
) -> dict:
    """Overwrite a user's password without requiring the old one. Admin only."""
    service = UserService(db)
    await service.reset_password(user_id=user_id, new_password=body.new_password)
    return success_response(message="Password reset successfully")


@router.post("/me/change-password", response_model=None, status_code=status.HTTP_200_OK, summary="Change your password")
async def change_my_password(
    body: PasswordChange,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Self-service password change — verifies the current password."""
    service = UserService(db)
    await service.change_password(
        user_id=current_user["id"],
        current_password=body.current_password,
        new_password=body.new_password,
    )
    return success_response(message="Password changed successfully")


# ── Bulk operations (admin-only) ───────────────────────────────────────────
#
# All three honour the same self-protection rules as the per-row
# endpoints: an admin cannot deactivate / role-change / delete
# themselves. That row is reported in ``failed`` and the rest of the
# batch proceeds.


@router.post(
    "/bulk-set-active",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Activate or deactivate multiple users",
)
async def bulk_set_active_users(
    payload: _BulkSetActive = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(_AdminOnly),
) -> dict:
    service = UserService(db)
    result = await service.bulk_set_active(
        payload.ids, payload.is_active, requested_by=current_user["id"]
    )
    label = "activated" if payload.is_active else "deactivated"
    return success_response(
        data=result,
        message=f"{len(result['succeeded'])} user(s) {label}",
    )


@router.post(
    "/bulk-set-role",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Assign multiple users to a single role",
)
async def bulk_set_role_users(
    payload: _BulkSetRole = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(_AdminOnly),
) -> dict:
    service = UserService(db)
    result = await service.bulk_set_role(
        payload.ids, payload.role_id, requested_by=current_user["id"]
    )
    return success_response(
        data=result,
        message=f"{len(result['succeeded'])} user(s) updated",
    )


@router.post(
    "/bulk-delete",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Soft-delete multiple users",
)
async def bulk_delete_users(
    payload: _BulkIds = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(_AdminOnly),
) -> dict:
    service = UserService(db)
    result = await service.bulk_delete(payload.ids, requested_by=current_user["id"])
    return success_response(
        data=result,
        message=f"{len(result['succeeded'])} user(s) deleted",
    )
