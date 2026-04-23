"""Module schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PaginatedResponse


class ModuleCreate(BaseModel):
    """Schema for creating a new module."""

    name: str = Field(
        min_length=1, max_length=255, description="Module name"
    )
    description: str | None = Field(
        default=None, max_length=2000, description="Module description"
    )
    project_id: UUID = Field(description="ID of the parent project")
    parent_module_id: UUID | None = Field(
        default=None, description="ID of the parent module for nested hierarchy"
    )


class ModuleUpdate(BaseModel):
    """Schema for updating an existing module."""

    name: str | None = Field(
        default=None, min_length=1, max_length=255, description="Module name"
    )
    description: str | None = Field(
        default=None, max_length=2000, description="Module description"
    )
    parent_module_id: UUID | None = Field(
        default=None, description="ID of the parent module for nested hierarchy"
    )
    is_active: bool | None = Field(
        default=None, description="Whether the module is active"
    )


class ModuleResponse(BaseModel):
    """Schema for module data returned in responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique module identifier")
    name: str = Field(description="Module name")
    description: str | None = Field(description="Module description")
    project_id: UUID = Field(description="ID of the parent project")
    parent_module_id: UUID | None = Field(
        description="ID of the parent module"
    )
    is_active: bool = Field(description="Whether the module is active")
    created_at: datetime = Field(description="Module creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")


class ModuleListResponse(PaginatedResponse[ModuleResponse]):
    """Paginated list of modules."""

    pass
