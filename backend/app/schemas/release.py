"""Release schemas."""

from datetime import date, datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PaginatedResponse


class ReleaseStatus(StrEnum):
    """Enumeration of release statuses."""

    PLANNED = "planned"
    IN_PROGRESS = "in_progress"
    RELEASED = "released"
    ARCHIVED = "archived"


class ReleaseCreate(BaseModel):
    """Schema for creating a new release."""

    name: str = Field(
        min_length=1, max_length=255, description="Release name"
    )
    version: str = Field(
        min_length=1, max_length=50, description="Release version string (e.g., '1.0.0')"
    )
    description: str | None = Field(
        default=None, max_length=2000, description="Release description"
    )
    project_id: UUID = Field(description="ID of the associated project")
    start_date: date | None = Field(
        default=None, description="Planned start date"
    )
    end_date: date | None = Field(
        default=None, description="Planned end / release date"
    )
    status: ReleaseStatus = Field(
        default=ReleaseStatus.PLANNED, description="Current release status"
    )


class ReleaseUpdate(BaseModel):
    """Schema for updating an existing release."""

    name: str | None = Field(
        default=None, min_length=1, max_length=255, description="Release name"
    )
    version: str | None = Field(
        default=None, min_length=1, max_length=50, description="Release version string"
    )
    description: str | None = Field(
        default=None, max_length=2000, description="Release description"
    )
    start_date: date | None = Field(
        default=None, description="Planned start date"
    )
    end_date: date | None = Field(
        default=None, description="Planned end / release date"
    )
    status: ReleaseStatus | None = Field(
        default=None, description="Current release status"
    )


class ReleaseResponse(BaseModel):
    """Schema for release data returned in responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique release identifier")
    name: str = Field(description="Release name")
    version: str = Field(description="Release version string")
    description: str | None = Field(description="Release description")
    project_id: UUID = Field(description="ID of the associated project")
    start_date: date | None = Field(description="Planned start date")
    end_date: date | None = Field(description="Planned end / release date")
    status: ReleaseStatus = Field(description="Current release status")
    created_at: datetime = Field(description="Release creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")


class ReleaseListResponse(PaginatedResponse[ReleaseResponse]):
    """Paginated list of releases."""

    pass
