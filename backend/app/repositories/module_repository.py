"""Repository for Module entity operations."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.module import Module
from app.repositories.base import BaseRepository


class ModuleRepository(BaseRepository[Module]):
    """Repository for Module-specific database operations."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Module, session)

    async def get_by_project(self, project_id: uuid.UUID) -> list[Module]:
        """Get all modules belonging to a project."""
        stmt = self._base_query().where(Module.project_id == project_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
