"""Repository for Attachment entity operations."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.base import BaseRepository


class AttachmentRepository(BaseRepository):
    """Repository for Attachment-specific database operations."""

    def __init__(self, session: AsyncSession) -> None:
        from app.models.attachment import Attachment

        super().__init__(Attachment, session)

    async def get_by_entity(
        self,
        entity_type: str,
        entity_id: uuid.UUID,
    ) -> list:
        """Get all attachments for a given entity (e.g., test_case, defect).

        Args:
            entity_type: The type of entity (e.g., 'test_case', 'defect').
            entity_id: The UUID of the entity.
        """
        stmt = self._base_query().where(
            self.model.entity_type == entity_type,
            self.model.entity_id == entity_id,
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
