"""Project schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PaginatedResponse


class ProjectCreate(BaseModel):
    """Schema for creating a new project."""

    name: str = Field(
        min_length=1, max_length=255, description="Project name"
    )
    code: str = Field(
        min_length=2,
        max_length=10,
        pattern="^[A-Z][A-Z0-9_-]*$",
        description="Unique project code (e.g., 'PROJ1')",
    )
    description: str | None = Field(
        default=None, max_length=2000, description="Project description"
    )
    category: str | None = Field(
        default=None, max_length=50, description="Project category"
    )
    is_active: bool = Field(
        default=True, description="Whether the project is active"
    )


class ProjectUpdate(BaseModel):
    """Schema for updating an existing project."""

    name: str | None = Field(
        default=None, min_length=1, max_length=255, description="Project name"
    )
    description: str | None = Field(
        default=None, max_length=2000, description="Project description"
    )
    category: str | None = Field(
        default=None, max_length=50, description="Project category"
    )
    is_active: bool | None = Field(
        default=None, description="Whether the project is active"
    )


class ProjectResponse(BaseModel):
    """Schema for project data returned in responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique project identifier")
    name: str = Field(description="Project name")
    code: str = Field(description="Unique project code")
    description: str | None = Field(description="Project description")
    is_active: bool = Field(description="Whether the project is active")
    created_at: datetime = Field(description="Project creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")


class ProjectListResponse(PaginatedResponse[ProjectResponse]):
    """Paginated list of projects."""

    pass
