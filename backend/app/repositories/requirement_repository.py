"""Repository for Requirement entity operations."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.base import BaseRepository


class RequirementRepository(BaseRepository):
    """Repository for Requirement-specific database operations."""

    def __init__(self, session: AsyncSession) -> None:
        from app.models.requirement import Requirement

        super().__init__(Requirement, session)

    async def get_by_project(self, project_id: uuid.UUID) -> list:
        """Get all requirements belonging to a project."""
        stmt = self._base_query().where(self.model.project_id == project_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_external_id(self, external_id: str):
        """Get a requirement by its external tracking ID (e.g., JIRA issue key)."""
        stmt = self._base_query().where(self.model.external_id == external_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
