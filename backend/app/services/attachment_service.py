"""Attachment service: upload, download, and delete."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.repositories.attachment_repository import AttachmentRepository


class AttachmentService:
    """Manages file attachments associated with various entities."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.attachment_repo = AttachmentRepository(session)

    async def upload(
        self,
        entity_type: str,
        entity_id: uuid.UUID,
        filename: str,
        content_type: str,
        file_path: str,
        file_size: int,
        uploaded_by: uuid.UUID,
    ) -> Any:
        """Record an attachment upload.

        Args:
            entity_type: The type of parent entity (e.g., 'test_case', 'defect').
            entity_id: The UUID of the parent entity.
            filename: Original filename.
            content_type: MIME type of the file.
            file_path: Storage path (local or cloud URL).
            file_size: Size of the file in bytes.
            uploaded_by: The user who uploaded the attachment.

        Returns:
            The created attachment record.
        """
        data = {
            "entity_type": entity_type,
            "entity_id": entity_id,
            "file_name": filename,
            "content_type": content_type,
            "file_path": file_path,
            "file_size": file_size,
            "uploaded_by": uploaded_by,
        }
        return await self.attachment_repo.create(data)

    async def download(self, attachment_id: uuid.UUID) -> Any:
        """Get attachment metadata for download.

        Returns the attachment record which contains the file_path needed
        to serve the file.

        Raises:
            NotFoundError: If the attachment does not exist.
        """
        attachment = await self.attachment_repo.get_by_id(attachment_id)
        if attachment is None:
            raise NotFoundError(f"Attachment with id '{attachment_id}' not found")
        return attachment

    async def list_by_entity(
        self,
        entity_type: str,
        entity_id: uuid.UUID,
    ) -> list:
        """List all attachments for a given entity."""
        return await self.attachment_repo.get_by_entity(entity_type, entity_id)

    async def delete(self, attachment_id: uuid.UUID) -> Any:
        """Soft-delete an attachment.

        Raises:
            NotFoundError: If the attachment does not exist.
        """
        attachment = await self.attachment_repo.soft_delete(attachment_id)
        if attachment is None:
            raise NotFoundError(f"Attachment with id '{attachment_id}' not found")
        return attachment
