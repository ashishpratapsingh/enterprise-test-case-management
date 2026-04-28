"""User and role schemas."""

from __future__ import annotations

import re
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.common import PaginatedResponse


_PASSWORD_PATTERN = re.compile(r"^(?=.*[A-Za-z])(?=.*\d).{8,128}$")


def _validate_password_strength(value: str) -> str:
    if not _PASSWORD_PATTERN.match(value):
        raise ValueError(
            "Password must be 8–128 characters and include at least one letter and one digit."
        )
    return value


# ── User schemas ────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    """Schema for creating a new user."""

    email: EmailStr = Field(description="User email address")
    password: str = Field(min_length=8, max_length=128, description="User password")
    full_name: str = Field(min_length=1, max_length=255, description="Full name")
    role_id: UUID = Field(description="Role UUID (see GET /roles)")
    is_active: bool = Field(default=True, description="Whether the account is active")

    @field_validator("password")
    @classmethod
    def _validate_password(cls, v: str) -> str:
        return _validate_password_strength(v)


class UserUpdate(BaseModel):
    """Schema for updating an existing user (all fields optional)."""

    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    role_id: UUID | None = Field(default=None, description="Role UUID")
    is_active: bool | None = Field(default=None)


class PasswordReset(BaseModel):
    """Admin-triggered password reset."""

    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _validate_password(cls, v: str) -> str:
        return _validate_password_strength(v)


class PasswordChange(BaseModel):
    """Self-service password change — requires current password."""

    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def _validate_password(cls, v: str) -> str:
        return _validate_password_strength(v)


class UserResponse(BaseModel):
    """Schema for user data returned in responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    full_name: str
    role_id: UUID
    role_name: str
    is_active: bool
    created_at: datetime
    updated_at: datetime | None = None


class UserListResponse(PaginatedResponse[UserResponse]):
    """Paginated list of users."""

    pass


# ── Role schemas ────────────────────────────────────────────────────────────

class RoleResponse(BaseModel):
    """Schema for role data returned in responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str | None = None
    permissions: dict | None = None


class RoleCreate(BaseModel):
    """Schema for creating a role."""

    name: str = Field(min_length=1, max_length=50, description="Display name")
    description: str | None = Field(default=None, max_length=500)
    permissions: dict | None = Field(
        default=None,
        description="Resource → list-of-actions map, e.g. {'users': ['read']}",
    )


class RoleUpdate(BaseModel):
    """Schema for updating a role (all fields optional)."""

    name: str | None = Field(default=None, min_length=1, max_length=50)
    description: str | None = Field(default=None, max_length=500)
    permissions: dict | None = None
