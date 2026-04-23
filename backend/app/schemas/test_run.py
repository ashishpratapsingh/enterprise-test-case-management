"""Test run schemas."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PaginatedResponse


class TestRunStatus(StrEnum):
    """Enumeration of test run statuses."""

    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    ABORTED = "aborted"


class TestRunCreate(BaseModel):
    """Schema for creating a new test run."""

    name: str = Field(
        min_length=1, max_length=255, description="Test run name"
    )
    description: str | None = Field(
        default=None, max_length=2000, description="Test run description"
    )
    project_id: UUID = Field(description="ID of the associated project")
    test_suite_id: UUID | None = Field(
        default=None, description="ID of the test suite to execute"
    )
    release_id: UUID | None = Field(
        default=None, description="ID of the associated release"
    )
    environment: str | None = Field(
        default=None,
        max_length=100,
        description="Execution environment (e.g., 'staging', 'production', 'QA')",
    )
    assigned_to: UUID | None = Field(
        default=None, description="ID of the user assigned to execute the run"
    )
    planned_start_date: datetime | None = Field(
        default=None, description="Planned start date and time"
    )
    planned_end_date: datetime | None = Field(
        default=None, description="Planned end date and time"
    )


class TestRunUpdate(BaseModel):
    """Schema for updating an existing test run."""

    name: str | None = Field(
        default=None, min_length=1, max_length=255, description="Test run name"
    )
    description: str | None = Field(
        default=None, max_length=2000, description="Test run description"
    )
    status: TestRunStatus | None = Field(
        default=None, description="Current test run status"
    )
    environment: str | None = Field(
        default=None,
        max_length=100,
        description="Execution environment",
    )
    assigned_to: UUID | None = Field(
        default=None, description="ID of the user assigned to execute the run"
    )
    planned_start_date: datetime | None = Field(
        default=None, description="Planned start date and time"
    )
    planned_end_date: datetime | None = Field(
        default=None, description="Planned end date and time"
    )


class TestRunResponse(BaseModel):
    """Schema for test run data returned in responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique test run identifier")
    name: str = Field(description="Test run name")
    description: str | None = Field(description="Test run description")
    project_id: UUID = Field(description="ID of the associated project")
    test_suite_id: UUID | None = Field(description="ID of the test suite")
    release_id: UUID | None = Field(description="ID of the associated release")
    status: TestRunStatus = Field(description="Current test run status")
    environment: str | None = Field(description="Execution environment")
    assigned_to: UUID | None = Field(
        description="ID of the assigned user"
    )
    planned_start_date: datetime | None = Field(
        description="Planned start date"
    )
    planned_end_date: datetime | None = Field(description="Planned end date")
    actual_start_date: datetime | None = Field(
        description="Actual start date"
    )
    actual_end_date: datetime | None = Field(description="Actual end date")
    total_cases: int = Field(
        default=0, ge=0, description="Total number of test cases in the run"
    )
    passed: int = Field(default=0, ge=0, description="Number of passed cases")
    failed: int = Field(default=0, ge=0, description="Number of failed cases")
    blocked: int = Field(default=0, ge=0, description="Number of blocked cases")
    skipped: int = Field(default=0, ge=0, description="Number of skipped cases")
    created_by: UUID = Field(description="ID of the user who created the run")
    created_at: datetime = Field(description="Test run creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")


class TestRunListResponse(PaginatedResponse[TestRunResponse]):
    """Paginated list of test runs."""

    pass
