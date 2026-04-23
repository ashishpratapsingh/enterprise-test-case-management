"""Test execution schemas."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PaginatedResponse


class ExecutionStatus(StrEnum):
    """Enumeration of execution statuses."""

    PENDING = "pending"
    PASSED = "passed"
    FAILED = "failed"
    BLOCKED = "blocked"
    SKIPPED = "skipped"
    IN_PROGRESS = "in_progress"


class StepResult(BaseModel):
    """Result of an individual test step execution."""

    step_number: int = Field(ge=1, description="Step number being reported on")
    status: ExecutionStatus = Field(description="Execution status of this step")
    actual_result: str | None = Field(
        default=None,
        max_length=2000,
        description="Actual result observed during execution",
    )
    notes: str | None = Field(
        default=None,
        max_length=2000,
        description="Additional notes or observations for this step",
    )


class ExecutionCreate(BaseModel):
    """Schema for creating a new test execution."""

    test_run_id: UUID = Field(description="ID of the parent test run")
    test_case_id: UUID = Field(description="ID of the test case being executed")


class ExecutionUpdate(BaseModel):
    """Schema for updating an existing test execution."""

    status: ExecutionStatus = Field(description="Overall execution status")
    step_results: list[StepResult] | None = Field(
        default=None, description="Results for individual test steps"
    )
    actual_result: str | None = Field(
        default=None,
        max_length=5000,
        description="Overall actual result of the execution",
    )
    defect_id: UUID | None = Field(
        default=None, description="ID of the defect raised during execution"
    )
    notes: str | None = Field(
        default=None,
        max_length=5000,
        description="Execution notes or comments",
    )


class ExecutionResponse(BaseModel):
    """Schema for test execution data returned in responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique execution identifier")
    test_run_id: UUID = Field(description="ID of the parent test run")
    test_case_id: UUID = Field(description="ID of the executed test case")
    status: ExecutionStatus = Field(description="Overall execution status")
    step_results: list[StepResult] | None = Field(
        description="Results for individual test steps"
    )
    actual_result: str | None = Field(
        description="Overall actual result of the execution"
    )
    defect_id: UUID | None = Field(
        description="ID of the defect raised during execution"
    )
    notes: str | None = Field(description="Execution notes or comments")
    executed_by: UUID = Field(description="ID of the user who executed the test")
    started_at: datetime | None = Field(description="Execution start timestamp")
    completed_at: datetime | None = Field(description="Execution completion timestamp")
    duration_seconds: int | None = Field(
        ge=0, description="Execution duration in seconds"
    )
    created_at: datetime = Field(description="Record creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")


class ExecutionListResponse(PaginatedResponse[ExecutionResponse]):
    """Paginated list of executions."""

    pass
