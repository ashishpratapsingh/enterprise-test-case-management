"""Dashboard and reporting schemas."""

import datetime as _dt
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TestCoverageResponse(BaseModel):
    """Test coverage metrics for a project or module."""

    model_config = ConfigDict(from_attributes=True)

    project_id: UUID = Field(description="Project identifier")
    total_requirements: int = Field(
        ge=0, description="Total number of requirements"
    )
    covered_requirements: int = Field(
        ge=0, description="Number of requirements with linked test cases"
    )
    coverage_percentage: float = Field(
        ge=0.0, le=100.0, description="Test coverage percentage"
    )
    uncovered_requirement_ids: list[UUID] = Field(
        default_factory=list,
        description="IDs of requirements without test coverage",
    )


class PassFailRatioResponse(BaseModel):
    """Pass/fail ratio metrics for a test run or project."""

    model_config = ConfigDict(from_attributes=True)

    total_executions: int = Field(ge=0, description="Total number of executions")
    passed: int = Field(ge=0, description="Number of passed executions")
    failed: int = Field(ge=0, description="Number of failed executions")
    blocked: int = Field(ge=0, description="Number of blocked executions")
    skipped: int = Field(ge=0, description="Number of skipped executions")
    pending: int = Field(ge=0, description="Number of pending executions")
    pass_rate: float = Field(
        ge=0.0, le=100.0, description="Pass rate percentage"
    )
    fail_rate: float = Field(
        ge=0.0, le=100.0, description="Fail rate percentage"
    )


class AutomationCoverageResponse(BaseModel):
    """Automation coverage metrics for a project."""

    model_config = ConfigDict(from_attributes=True)

    project_id: UUID = Field(description="Project identifier")
    total_test_cases: int = Field(ge=0, description="Total number of test cases")
    automated: int = Field(ge=0, description="Number of automated test cases")
    not_automated: int = Field(
        ge=0, description="Number of non-automated test cases"
    )
    in_progress: int = Field(
        ge=0, description="Number of test cases with automation in progress"
    )
    not_applicable: int = Field(
        ge=0, description="Number of test cases where automation is not applicable"
    )
    automation_percentage: float = Field(
        ge=0.0, le=100.0, description="Automation coverage percentage"
    )


class ExecutionTrendDataPoint(BaseModel):
    """A single data point in an execution trend."""

    date: _dt.date = Field(description="Date of the data point")
    passed: int = Field(ge=0, description="Number of passed executions")
    failed: int = Field(ge=0, description="Number of failed executions")
    blocked: int = Field(ge=0, description="Number of blocked executions")
    skipped: int = Field(ge=0, description="Number of skipped executions")
    total: int = Field(ge=0, description="Total executions on this date")


class ExecutionTrendResponse(BaseModel):
    """Execution trend data over a time period."""

    model_config = ConfigDict(from_attributes=True)

    project_id: UUID = Field(description="Project identifier")
    start_date: _dt.date = Field(description="Start date of the trend period")
    end_date: _dt.date = Field(description="End date of the trend period")
    data_points: list[ExecutionTrendDataPoint] = Field(
        description="Trend data points"
    )


class DefectDensityResponse(BaseModel):
    """Defect density metrics for a project."""

    model_config = ConfigDict(from_attributes=True)

    project_id: UUID = Field(description="Project identifier")
    total_defects: int = Field(ge=0, description="Total number of defects")
    open_defects: int = Field(ge=0, description="Number of open defects")
    closed_defects: int = Field(ge=0, description="Number of closed defects")
    defects_by_severity: dict[str, int] = Field(
        description="Defect count grouped by severity"
    )
    defects_by_priority: dict[str, int] = Field(
        description="Defect count grouped by priority"
    )
    defect_density: float = Field(
        ge=0.0,
        description="Defect density (defects per test case)",
    )


class ReleaseReadinessResponse(BaseModel):
    """Release readiness assessment metrics."""

    model_config = ConfigDict(from_attributes=True)

    release_id: UUID = Field(description="Release identifier")
    release_name: str = Field(description="Release name")
    total_test_cases: int = Field(
        ge=0, description="Total test cases planned for the release"
    )
    executed: int = Field(ge=0, description="Number of executed test cases")
    passed: int = Field(ge=0, description="Number of passed test cases")
    failed: int = Field(ge=0, description="Number of failed test cases")
    blocked: int = Field(ge=0, description="Number of blocked test cases")
    not_executed: int = Field(
        ge=0, description="Number of test cases not yet executed"
    )
    execution_percentage: float = Field(
        ge=0.0, le=100.0, description="Percentage of test cases executed"
    )
    pass_rate: float = Field(
        ge=0.0, le=100.0, description="Pass rate among executed test cases"
    )
    open_defects: int = Field(
        ge=0, description="Number of open defects for this release"
    )
    critical_defects: int = Field(
        ge=0, description="Number of critical/blocker defects"
    )
    is_ready: bool = Field(
        description="Whether the release meets readiness criteria"
    )
