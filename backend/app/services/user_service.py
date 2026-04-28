"""User service: CRUD, role assignment, lifecycle (activate/deactivate), password management."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from app.core.security import get_password_hash, verify_password
from app.models.role import Role
from app.models.user import User
from app.repositories.user_repository import UserRepository


class UserService:
    """Manages user lifecycle: CRUD, role assignment, activation, password management."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.user_repo = UserRepository(session)

    # ── Lookup ─────────────────────────────────────────────────────────────

    async def get_user(self, user_id: uuid.UUID | str) -> Any:
        """Get a user by id with role eagerly loaded."""
        user = await self.user_repo.get_with_role(user_id)
        if user is None:
            raise NotFoundError(f"User with id '{user_id}' not found")
        return user

    async def get_user_by_email(self, email: str) -> Any:
        """Get a user by email (with role) or raise NotFoundError."""
        stmt = (
            select(User)
            .options(selectinload(User.role))
            .where(User.email == email)
            .where(User.is_deleted == False)  # noqa: E712
        )
        result = await self.session.execute(stmt)
        user = result.scalar_one_or_none()
        if user is None:
            raise NotFoundError(f"User with email '{email}' not found")
        return user

    async def list_users(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        search: str | None = None,
        is_active: bool | None = None,
        role_id: str | None = None,
    ) -> tuple[list, int]:
        """List users with role eager-loaded.

        Supports filtering by search (email/full_name), active flag, and role_id.
        """
        stmt = (
            select(User)
            .options(selectinload(User.role))
            .where(User.is_deleted == False)  # noqa: E712
        )

        if is_active is not None:
            stmt = stmt.where(User.is_active == is_active)
        if role_id:
            stmt = stmt.where(User.role_id == role_id)
        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(or_(User.email.ilike(pattern), User.full_name.ilike(pattern)))

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.session.execute(count_stmt)).scalar_one()

        sort_col = getattr(User, sort_by, User.created_at)
        stmt = stmt.order_by(sort_col.asc() if sort_order == "asc" else sort_col.desc())
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

        result = await self.session.execute(stmt)
        return list(result.scalars().all()), total

    # ── Mutations ──────────────────────────────────────────────────────────

    async def create_user(self, data: dict[str, Any]) -> Any:
        """Create a new user. Hashes password and verifies email uniqueness + role validity.

        Raises:
            ConflictError: if the email already exists.
            ValidationError: if the role_id does not exist.
        """
        existing = await self.user_repo.get_by_email(data["email"])
        if existing is not None and not existing.is_deleted:
            raise ConflictError(f"A user with email '{data['email']}' already exists")

        # Coerce UUIDs to strings for SQLite-compatible FK binding.
        if "role_id" in data and data["role_id"] is not None:
            data["role_id"] = str(data["role_id"])

        await self._assert_role_exists(data["role_id"])

        if "password" in data:
            data["hashed_password"] = get_password_hash(data.pop("password"))

        user = await self.user_repo.create(data)
        return await self.get_user(user.id)

    async def update_user(self, user_id: uuid.UUID | str, data: dict[str, Any]) -> Any:
        """Update user fields. Supports full_name, role_id, is_active."""
        if "role_id" in data and data["role_id"] is not None:
            data["role_id"] = str(data["role_id"])
            await self._assert_role_exists(data["role_id"])

        user = await self.user_repo.update(user_id, data)
        if user is None:
            raise NotFoundError(f"User with id '{user_id}' not found")
        return await self.get_user(user.id)

    async def set_active(
        self,
        user_id: uuid.UUID | str,
        active: bool,
        *,
        requested_by: str | None = None,
    ) -> Any:
        """Activate or deactivate a user. An admin cannot deactivate themselves."""
        if not active and requested_by and str(requested_by) == str(user_id):
            raise ValidationError("You cannot deactivate your own account.")

        user = await self.user_repo.update(user_id, {"is_active": active})
        if user is None:
            raise NotFoundError(f"User with id '{user_id}' not found")
        return await self.get_user(user.id)

    async def delete_user(
        self,
        user_id: uuid.UUID | str,
        *,
        requested_by: str | None = None,
    ) -> Any:
        """Soft-delete a user. An admin cannot delete themselves."""
        if requested_by and str(requested_by) == str(user_id):
            raise ValidationError("You cannot delete your own account.")

        user = await self.user_repo.soft_delete(user_id)
        if user is None:
            raise NotFoundError(f"User with id '{user_id}' not found")
        return user

    async def reset_password(
        self,
        user_id: uuid.UUID | str,
        new_password: str,
    ) -> Any:
        """Admin-triggered password reset — overwrites password without requiring the old one."""
        user = await self.user_repo.update(
            user_id,
            {"hashed_password": get_password_hash(new_password)},
        )
        if user is None:
            raise NotFoundError(f"User with id '{user_id}' not found")
        return await self.get_user(user.id)

    async def change_password(
        self,
        user_id: uuid.UUID | str,
        current_password: str,
        new_password: str,
    ) -> Any:
        """Self-service password change — verifies the current password first."""
        user = await self.user_repo.get_by_id(user_id)
        if user is None:
            raise NotFoundError(f"User with id '{user_id}' not found")
        if not verify_password(current_password, user.hashed_password):
            raise UnauthorizedError("Current password is incorrect.")
        if current_password == new_password:
            raise ValidationError("New password must be different from the current password.")

        user = await self.user_repo.update(
            user_id,
            {"hashed_password": get_password_hash(new_password)},
        )
        return await self.get_user(user.id)

    # ── Bulk operations ───────────────────────────────────────────────────
    #
    # Self-protection rules carry over from the per-row methods:
    # an admin cannot deactivate / delete / role-change themselves.
    # That row is reported as failed, the rest of the batch proceeds.

    async def bulk_set_active(
        self,
        user_ids: list[Any],
        active: bool,
        *,
        requested_by: str | None = None,
    ) -> dict[str, list]:
        succeeded: list[str] = []
        failed: list[dict[str, str]] = []
        for uid in user_ids:
            try:
                await self.set_active(uid, active, requested_by=requested_by)
                succeeded.append(str(uid))
            except (NotFoundError, ValidationError) as e:
                failed.append({"id": str(uid), "error": str(e)})
        return {"succeeded": succeeded, "failed": failed}

    async def bulk_set_role(
        self,
        user_ids: list[Any],
        role_id: str,
        *,
        requested_by: str | None = None,
    ) -> dict[str, list]:
        """Assign every selected user to ``role_id``. Validates the
        role exists once up front; per-row failures (NotFound, self-
        role-change attempt) are reported, not raised."""
        await self._assert_role_exists(role_id)
        succeeded: list[str] = []
        failed: list[dict[str, str]] = []
        for uid in user_ids:
            try:
                if requested_by and str(requested_by) == str(uid):
                    raise ValidationError("You cannot change your own role.")
                user = await self.user_repo.update(uid, {"role_id": str(role_id)})
                if user is None:
                    raise NotFoundError(f"User with id '{uid}' not found")
                succeeded.append(str(uid))
            except (NotFoundError, ValidationError) as e:
                failed.append({"id": str(uid), "error": str(e)})
        return {"succeeded": succeeded, "failed": failed}

    async def bulk_delete(
        self,
        user_ids: list[Any],
        *,
        requested_by: str | None = None,
    ) -> dict[str, list]:
        succeeded: list[str] = []
        failed: list[dict[str, str]] = []
        for uid in user_ids:
            try:
                await self.delete_user(uid, requested_by=requested_by)
                succeeded.append(str(uid))
            except (NotFoundError, ValidationError) as e:
                failed.append({"id": str(uid), "error": str(e)})
        return {"succeeded": succeeded, "failed": failed}

    # ── Helpers ────────────────────────────────────────────────────────────

    async def _assert_role_exists(self, role_id: uuid.UUID | str) -> None:
        result = await self.session.execute(
            select(Role.id).where(Role.id == str(role_id))
        )
        if result.scalar_one_or_none() is None:
            raise ValidationError(f"Role with id '{role_id}' does not exist.")
