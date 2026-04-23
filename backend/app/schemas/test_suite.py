"""Test suite schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PaginatedResponse


class TestSuiteCreate(BaseModel):
    """Schema for creating a new test suite."""

    name: str = Field(
        min_length=1, max_length=255, description="Test suite name"
    )
    description: str | None = Field(
        default=None, max_length=2000, description="Test suite description"
    )
    project_id: UUID = Field(description="ID of the associated project")


class TestSuiteUpdate(BaseModel):
    """Schema for updating an existing test suite."""

    name: str | None = Field(
        default=None, min_length=1, max_length=255, description="Test suite name"
    )
    description: str | None = Field(
        default=None, max_length=2000, description="Test suite description"
    )
    is_active: bool | None = Field(
        default=None, description="Whether the test suite is active"
    )


class TestSuiteResponse(BaseModel):
    """Schema for test suite data returned in responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique test suite identifier")
    name: str = Field(description="Test suite name")
    description: str | None = Field(description="Test suite description")
    project_id: UUID = Field(description="ID of the associated project")
    is_active: bool = Field(description="Whether the test suite is active")
    test_case_count: int = Field(
        default=0, ge=0, description="Number of test cases in the suite"
    )
    created_at: datetime = Field(description="Test suite creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")


class TestSuiteListResponse(PaginatedResponse[TestSuiteResponse]):
    """Paginated list of test suites."""

    pass


class AddTestCaseRequest(BaseModel):
    """Schema for adding a test case to a test suite."""

    test_case_id: UUID = Field(description="ID of the test case to add")
    position: int | None = Field(
        default=None,
        ge=1,
        description="Position in the suite ordering (appended to end if not specified)",
    )


class ReorderRequest(BaseModel):
    """Schema for reordering test cases within a test suite."""

    test_case_ids: list[UUID] = Field(
        min_length=1,
        description="Ordered list of test case IDs representing the new order",
    )
