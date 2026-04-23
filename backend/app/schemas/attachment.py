"""Attachment schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import PaginatedResponse


class AttachmentResponse(BaseModel):
    """Schema for attachment data returned in responses."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID = Field(description="Unique attachment identifier")
    file_name: str = Field(description="Original file name")
    file_size: int = Field(ge=0, description="File size in bytes")
    content_type: str = Field(
        description="MIME content type (e.g., 'image/png', 'application/pdf')"
    )
    entity_type: str = Field(
        description="Type of entity the attachment belongs to (e.g., 'test_case', 'defect')"
    )
    entity_id: UUID = Field(description="ID of the parent entity")
    uploaded_by: UUID = Field(description="ID of the user who uploaded the file")
    created_at: datetime = Field(description="Upload timestamp")


class AttachmentListResponse(PaginatedResponse[AttachmentResponse]):
    """Paginated list of attachments."""

    pass
