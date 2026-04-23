"""Test case schemas."""

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PaginatedResponse


class TestCasePriority(StrEnum):
    """Enumeration of test case priorities."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class TestCaseSeverity(StrEnum):
    """Enumeration of test case severities."""

    TRIVIAL = "trivial"
    MINOR = "minor"
    MAJOR = "major"
    CRITICAL = "critical"
    BLOCKER = "blocker"


class TestCaseType(StrEnum):
    """Enumeration of test case types."""

    FUNCTIONAL = "functional"
    REGRESSION = "regression"
    SMOKE = "smoke"
    INTEGRATION = "integration"
    PERFORMANCE = "performance"
    SECURITY = "security"
    USABILITY = "usability"
    EXPLORATORY = "exploratory"


class AutomationStatus(StrEnum):
    """Enumeration of automation statuses."""

    NOT_AUTOMATED = "not_automated"
    AUTOMATED = "automated"
    IN_PROGRESS = "in_progress"
    NOT_APPLICABLE = "not_applicable"


class TestCaseStatus(StrEnum):
    """Enumeration of test case lifecycle statuses."""

    DRAFT = "draft"
    REVIEW = "review"
    APPROVED = "approved"
    DEPRECATED = "deprecated"


class TestStep(BaseModel):
    """A single step within a test case."""

    step_number: int = Field(ge=1, description="Sequential step number")
    action: str = Field(
        min_length=1, max_length=2000, description="Action to perform in this step"
    )
    expected_result: str = Field(
        min_length=1,
        max_length=2000,
        description="Expected outcome after performing the action",
    )


class TestCaseCreate(BaseModel):
    """Schema for creating a new test case."""

    title: str = Field(
        min_length=1, max_length=500, description="Test case title"
    )
    description: str | None = Field(
        default=None, max_length=5000, description="Detailed test case description"
    )
    preconditions: str | None = Field(
        default=None,
        max_length=2000,
        description="Preconditions that must be met before execution",
    )
    steps: list[TestStep] = Field(
        min_length=1, description="Ordered list of test steps"
    )
    expected_result: str = Field(
        min_length=1,
        max_length=2000,
        description="Overall expected result of the test case",
    )
    priority: TestCasePriority = Field(description="Test case priority")
    severity: TestCaseSeverity = Field(description="Test case severity")
    type: TestCaseType = Field(description="Type of test case")
    automation_status: AutomationStatus = Field(
        default=AutomationStatus.NOT_AUTOMATED,
        description="Current automation status",
    )
    module_id: UUID = Field(description="ID of the associated module")
    project_id: UUID = Field(description="ID of the associated project")
    requirement_id: UUID | None = Field(
        default=None, description="ID of the linked requirement"
    )
    jira_ticket_id: str | None = Field(
        default=None,
        max_length=100,
        description="JIRA ticket key (e.g., 'PROJ-456')",
    )
    tags: list[str] | None = Field(
        default=None, description="List of tags for categorization"
    )


class TestCaseUpdate(BaseModel):
    """Schema for updating an existing test case. All fields are optional."""

    title: str | None = Field(
        default=None, min_length=1, max_length=500, description="Test case title"
    )
    description: str | None = Field(
        default=None, max_length=5000, description="Detailed test case description"
    )
    preconditions: str | None = Field(
        default=None,
        max_length=2000,
        description="Preconditions that must be met before execution",
    )
    steps: list[TestStep] | None = Field(
        default=None, min_length=1, description="Ordered list of test steps"
    )
    expected_result: str | None = Field(
        default=None,
        max_length=2000,
        description="Overall expected result of the test case",
    )
    priority: TestCasePriority | None = Field(
        default=None, description="Test case priority"
    )
    severity: TestCaseSeverity | None = Field(
        default=None, description="Test case severity"
    )
    type: TestCaseType | None = Field(
        default=None, description="Type of test case"
    )
    automation_status: AutomationStatus | None = Field(
        default=None, description="Current automation status"
    )
    module_id: UUID | None = Field(
        default=None, description="ID of the associated module"
    )
    requirement_id: UUID | None = Field(
        default=None, description="ID of the linked requirement"
    )
    jira_ticket_id: str | None = Field(
        default=None,
        max_length=100,
        description="JIRA ticket key (e.g., 'PROJ-456')",
    )
    tags: list[str] | None = Field(
        default=None, description="List of tags for categorization"
    )
    status: TestCaseStatus | None = Field(
        default=None, description="Test case lifecycle status"
    )


class TestCaseResponse(BaseModel):
    """Schema for test case data returned in responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique test case identifier (internal)")
    test_case_id: str = Field(
        description="Human-readable test case ID (e.g., 'TC-00001')"
    )
    title: str = Field(description="Test case title")
    description: str | None = Field(description="Detailed test case description")
    preconditions: str | None = Field(description="Preconditions for execution")
    steps: list[TestStep] = Field(description="Ordered list of test steps")
    expected_result: str = Field(description="Overall expected result")
    priority: TestCasePriority = Field(description="Test case priority")
    severity: TestCaseSeverity = Field(description="Test case severity")
    type: TestCaseType = Field(description="Type of test case")
    automation_status: AutomationStatus = Field(
        description="Current automation status"
    )
    status: TestCaseStatus = Field(description="Test case lifecycle status")
    version: int = Field(description="Test case version number")
    module_id: UUID = Field(description="ID of the associated module")
    project_id: UUID = Field(description="ID of the associated project")
    requirement_id: UUID | None = Field(description="ID of the linked requirement")
    jira_ticket_id: str | None = Field(description="JIRA ticket key")
    tags: list[str] | None = Field(description="List of tags")
    created_by: UUID = Field(description="ID of the user who created the test case")
    updated_by: UUID | None = Field(
        description="ID of the user who last updated the test case"
    )
    created_at: datetime = Field(description="Test case creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")


class TestCaseListResponse(PaginatedResponse[TestCaseResponse]):
    """Paginated list of test cases."""

    pass


class TestCaseCloneRequest(BaseModel):
    """Schema for cloning an existing test case."""

    new_title: str | None = Field(
        default=None,
        min_length=1,
        max_length=500,
        description="Title for the cloned test case. Defaults to 'Copy of <original>'.",
    )


class TestCaseBulkUploadResponse(BaseModel):
    """Schema for the result of a bulk test case upload."""

    model_config = ConfigDict(from_attributes=True)

    total_rows: int = Field(
        ge=0, description="Total number of rows processed"
    )
    successful: int = Field(
        ge=0, description="Number of test cases successfully created"
    )
    failed: int = Field(ge=0, description="Number of rows that failed")
    errors: list[dict] = Field(
        default_factory=list,
        description="List of errors with row numbers and messages",
    )
    created_ids: list[UUID] = Field(
        default_factory=list,
        description="IDs of successfully created test cases",
    )
