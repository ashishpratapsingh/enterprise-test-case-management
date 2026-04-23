"""Repository for TestCaseVersion entity operations."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.base import BaseRepository


class TestCaseVersionRepository(BaseRepository):
    """Repository for TestCaseVersion-specific database operations."""

    def __init__(self, session: AsyncSession) -> None:
        from app.models.test_case_version import TestCaseVersion

        super().__init__(TestCaseVersion, session)

    async def get_versions_for_test_case(
        self,
        test_case_id: uuid.UUID,
    ) -> list:
        """Get all versions of a test case, ordered by version number descending."""
        stmt = (
            self._base_query()
            .where(self.model.test_case_id == test_case_id)
            .order_by(self.model.version_number.desc())
        )
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
