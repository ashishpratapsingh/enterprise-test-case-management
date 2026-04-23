"""Defect schemas."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PaginatedResponse


class DefectSeverity(StrEnum):
    """Enumeration of defect severities."""

    TRIVIAL = "trivial"
    MINOR = "minor"
    MAJOR = "major"
    CRITICAL = "critical"
    BLOCKER = "blocker"


class DefectPriority(StrEnum):
    """Enumeration of defect priorities."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class DefectStatus(StrEnum):
    """Enumeration of defect statuses."""

    NEW = "new"
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    FIXED = "fixed"
    VERIFIED = "verified"
    CLOSED = "closed"
    REOPENED = "reopened"
    DEFERRED = "deferred"
    DUPLICATE = "duplicate"
    REJECTED = "rejected"


class DefectCreate(BaseModel):
    """Schema for creating a new defect."""

    title: str = Field(
        min_length=1, max_length=500, description="Defect title"
    )
    description: str | None = Field(
        default=None, max_length=5000, description="Detailed defect description"
    )
    steps_to_reproduce: str | None = Field(
        default=None,
        max_length=5000,
        description="Steps to reproduce the defect",
    )
    project_id: UUID = Field(description="ID of the associated project")
    module_id: UUID | None = Field(
        default=None, description="ID of the associated module"
    )
    severity: DefectSeverity = Field(description="Defect severity")
    priority: DefectPriority = Field(description="Defect priority")
    assigned_to: UUID | None = Field(
        default=None, description="ID of the user assigned to fix the defect"
    )
    execution_id: UUID | None = Field(
        default=None, description="ID of the execution that found the defect"
    )
    external_id: str | None = Field(
        default=None,
        max_length=100,
        description="External bug tracker ID (e.g., JIRA key)",
    )


class DefectUpdate(BaseModel):
    """Schema for updating an existing defect."""

    title: str | None = Field(
        default=None, min_length=1, max_length=500, description="Defect title"
    )
    description: str | None = Field(
        default=None, max_length=5000, description="Detailed defect description"
    )
    steps_to_reproduce: str | None = Field(
        default=None,
        max_length=5000,
        description="Steps to reproduce the defect",
    )
    module_id: UUID | None = Field(
        default=None, description="ID of the associated module"
    )
    severity: DefectSeverity | None = Field(
        default=None, description="Defect severity"
    )
    priority: DefectPriority | None = Field(
        default=None, description="Defect priority"
    )
    status: DefectStatus | None = Field(
        default=None, description="Current defect status"
    )
    assigned_to: UUID | None = Field(
        default=None, description="ID of the user assigned to fix the defect"
    )
    external_id: str | None = Field(
        default=None,
        max_length=100,
        description="External bug tracker ID (e.g., JIRA key)",
    )


class DefectResponse(BaseModel):
    """Schema for defect data returned in responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique defect identifier")
    title: str = Field(description="Defect title")
    description: str | None = Field(description="Detailed defect description")
    steps_to_reproduce: str | None = Field(
        description="Steps to reproduce the defect"
    )
    project_id: UUID = Field(description="ID of the associated project")
    module_id: UUID | None = Field(description="ID of the associated module")
    severity: DefectSeverity = Field(description="Defect severity")
    priority: DefectPriority = Field(description="Defect priority")
    status: DefectStatus = Field(description="Current defect status")
    assigned_to: UUID | None = Field(description="ID of the assigned user")
    execution_id: UUID | None = Field(
        description="ID of the execution that found the defect"
    )
    external_id: str | None = Field(description="External bug tracker ID")
    reported_by: UUID = Field(description="ID of the user who reported the defect")
    created_at: datetime = Field(description="Defect creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")


class DefectListResponse(PaginatedResponse[DefectResponse]):
    """Paginated list of defects."""

    pass
