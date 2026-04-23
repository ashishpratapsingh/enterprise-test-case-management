"""Audit log schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PaginatedResponse


class AuditLogResponse(BaseModel):
    """Schema for audit log data returned in responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique audit log entry identifier")
    entity_type: str = Field(
        description="Type of entity that was modified (e.g., 'test_case', 'defect')"
    )
    entity_id: UUID = Field(description="ID of the modified entity")
    action: str = Field(
        description="Action performed (e.g., 'create', 'update', 'delete')"
    )
    old_values: dict | None = Field(
        description="Previous field values before the change"
    )
    new_values: dict | None = Field(
        description="New field values after the change"
    )
    user_id: UUID = Field(description="ID of the user who performed the action")
    ip_address: str | None = Field(description="IP address of the request origin")
    created_at: datetime = Field(description="Timestamp of the action")


class AuditLogFilter(BaseModel):
    """Filter parameters for querying audit logs."""

    entity_type: str | None = Field(
        default=None, description="Filter by entity type"
    )
    entity_id: UUID | None = Field(
        default=None, description="Filter by entity ID"
    )
    action: str | None = Field(
        default=None, description="Filter by action type"
    )
    user_id: UUID | None = Field(
        default=None, description="Filter by user who performed the action"
    )
    date_from: datetime | None = Field(
        default=None, description="Filter entries from this date/time (inclusive)"
    )
    date_to: datetime | None = Field(
        default=None, description="Filter entries up to this date/time (inclusive)"
    )


class AuditLogListResponse(PaginatedResponse[AuditLogResponse]):
    """Paginated list of audit log entries."""

    pass
