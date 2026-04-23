"""Repository for Release entity operations."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.base import BaseRepository


class ReleaseRepository(BaseRepository):
    """Repository for Release-specific database operations.

    Note: Import the Release model once it is created:
        from app.models.release import Release
    """

    def __init__(self, session: AsyncSession) -> None:
        from app.models.release import Release

        super().__init__(Release, session)

    async def get_by_project(self, project_id: uuid.UUID) -> list:
        """Get all releases belonging to a project."""
        stmt = self._base_query().where(self.model.project_id == project_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_status(self, status: str) -> list:
        """Get all releases with a given status."""
        stmt = self._base_query().where(self.model.status == status)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
