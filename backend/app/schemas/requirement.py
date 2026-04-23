"""Requirement schemas."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PaginatedResponse


class RequirementPriority(StrEnum):
    """Enumeration of requirement priorities."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RequirementStatus(StrEnum):
    """Enumeration of requirement statuses."""

    DRAFT = "draft"
    APPROVED = "approved"
    IN_PROGRESS = "in_progress"
    IMPLEMENTED = "implemented"
    DEPRECATED = "deprecated"


class RequirementCreate(BaseModel):
    """Schema for creating a new requirement."""

    title: str = Field(
        min_length=1, max_length=500, description="Requirement title"
    )
    description: str | None = Field(
        default=None, max_length=5000, description="Detailed requirement description"
    )
    external_id: str | None = Field(
        default=None,
        max_length=100,
        description="External identifier (e.g., JIRA ticket key like 'PROJ-123')",
    )
    project_id: UUID = Field(description="ID of the associated project")
    module_id: UUID | None = Field(
        default=None, description="ID of the associated module"
    )
    priority: RequirementPriority = Field(
        default=RequirementPriority.MEDIUM, description="Requirement priority"
    )
    status: RequirementStatus = Field(
        default=RequirementStatus.DRAFT, description="Current requirement status"
    )


class RequirementUpdate(BaseModel):
    """Schema for updating an existing requirement."""

    title: str | None = Field(
        default=None, min_length=1, max_length=500, description="Requirement title"
    )
    description: str | None = Field(
        default=None, max_length=5000, description="Detailed requirement description"
    )
    external_id: str | None = Field(
        default=None,
        max_length=100,
        description="External identifier (e.g., JIRA ticket key)",
    )
    module_id: UUID | None = Field(
        default=None, description="ID of the associated module"
    )
    priority: RequirementPriority | None = Field(
        default=None, description="Requirement priority"
    )
    status: RequirementStatus | None = Field(
        default=None, description="Current requirement status"
    )


class RequirementResponse(BaseModel):
    """Schema for requirement data returned in responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique requirement identifier")
    title: str = Field(description="Requirement title")
    description: str | None = Field(description="Detailed requirement description")
    external_id: str | None = Field(
        description="External identifier (e.g., JIRA ticket key)"
    )
    project_id: UUID = Field(description="ID of the associated project")
    module_id: UUID | None = Field(description="ID of the associated module")
    priority: RequirementPriority = Field(description="Requirement priority")
    status: RequirementStatus = Field(description="Current requirement status")
    created_at: datetime = Field(description="Requirement creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")


class RequirementListResponse(PaginatedResponse[RequirementResponse]):
    """Paginated list of requirements."""

    pass
