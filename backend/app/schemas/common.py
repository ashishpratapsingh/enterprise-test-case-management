"""Common schemas used across the application."""

from typing import Generic, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class PaginationParams(BaseModel):
    """Pagination query parameters."""

    page: int = Field(default=1, ge=1, description="Page number (1-indexed)")
    page_size: int = Field(
        default=20, ge=1, le=100, description="Number of items per page"
    )


class SortParams(BaseModel):
    """Sort query parameters."""

    sort_by: str = Field(default="created_at", description="Field name to sort by")
    sort_order: str = Field(
        default="desc",
        pattern="^(asc|desc)$",
        description="Sort order: 'asc' or 'desc'",
    )


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper."""

    model_config = ConfigDict(from_attributes=True)

    items: list[T] = Field(description="List of items for the current page")
    total: int = Field(ge=0, description="Total number of items across all pages")
    page: int = Field(ge=1, description="Current page number")
    page_size: int = Field(ge=1, description="Number of items per page")
    total_pages: int = Field(ge=0, description="Total number of pages")


class MessageResponse(BaseModel):
    """Simple message response."""

    message: str = Field(description="Response message")
