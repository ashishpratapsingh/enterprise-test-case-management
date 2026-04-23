"""Repository for TestSuite entity operations."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.repositories.base import BaseRepository


class TestSuiteRepository(BaseRepository):
    """Repository for TestSuite-specific database operations."""

    def __init__(self, session: AsyncSession) -> None:
        from app.models.test_suite import TestSuite

        super().__init__(TestSuite, session)

    async def get_all(self, **kwargs) -> tuple[list, int]:
        """Override to eagerly load test_suite_cases, excluding deleted test cases."""
        from app.models.test_case import TestCase

        items, total = await super().get_all(**kwargs)
        for item in items:
            await self.session.refresh(item, ["test_suite_cases", "creator"])
            # Filter out associations pointing to soft-deleted test cases
            valid_cases = []
            for sc in item.test_suite_cases:
                tc = await self.session.get(TestCase, sc.test_case_id)
                if tc and not getattr(tc, 'is_deleted', False):
                    valid_cases.append(sc)
            item.test_suite_cases = valid_cases
        return items, total

    async def get_by_project(self, project_id: uuid.UUID) -> list:
        """Get all test suites belonging to a project."""
        stmt = self._base_query().where(self.model.project_id == project_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_with_cases(self, suite_id: uuid.UUID):
        """Get a test suite with its test_suite_cases and nested test_case eagerly loaded."""
        from app.models.test_suite_case import TestSuiteCase

        stmt = (
            self._base_query()
            .options(
                joinedload(self.model.test_suite_cases).joinedload(TestSuiteCase.test_case)
            )
            .where(self.model.id == suite_id)
        )
        result = await self.session.execute(stmt)
        return result.unique().scalar_one_or_none()
