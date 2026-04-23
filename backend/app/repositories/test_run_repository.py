"""Repository for TestRun entity operations."""

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.base import BaseRepository


class TestRunRepository(BaseRepository):
    """Repository for TestRun-specific database operations."""

    def __init__(self, session: AsyncSession) -> None:
        from app.models.test_run import TestRun

        super().__init__(TestRun, session)

    async def get_all(self, **kwargs) -> tuple[list, int]:
        """List test runs with filter support for project_id (via test suite) and search.

        Accepts the standard base-repo kwargs plus these filter keys:
          - project_id: filter runs whose suite belongs to this project
          - search:     case-insensitive match on run name
        Other filter keys (status, test_suite_id, release_id) fall through to
        the generic column matcher on TestRun.
        """
        from app.models.test_suite import TestSuite

        filters: dict[str, Any] = dict(kwargs.pop("filters", None) or {})
        project_id = filters.pop("project_id", None)
        search = filters.pop("search", None)

        page = kwargs.get("page", 1)
        page_size = kwargs.get("page_size", 20)
        sort_by = kwargs.get("sort_by", "created_at")
        sort_order = kwargs.get("sort_order", "desc")
        include_deleted = kwargs.get("include_deleted", False)

        # If no special filters, delegate to the generic base implementation.
        if project_id is None and search is None:
            items, total = await super().get_all(filters=filters or None, **kwargs)
            for item in items:
                await self.session.refresh(item, ["creator"])
            return items, total

        stmt = self._base_query(include_deleted=include_deleted)

        if project_id is not None:
            stmt = stmt.join(
                TestSuite, TestSuite.id == self.model.test_suite_id
            ).where(TestSuite.project_id == project_id)

        for field_name, value in filters.items():
            col = getattr(self.model, field_name, None)
            if col is not None and value is not None:
                stmt = stmt.where(col == value)

        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(self.model.name.ilike(pattern))

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.session.execute(count_stmt)).scalar_one()

        sort_col = getattr(self.model, sort_by, None)
        if sort_col is not None:
            stmt = stmt.order_by(sort_col.asc() if sort_order == "asc" else sort_col.desc())

        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.session.execute(stmt)
        items = list(result.scalars().all())
        for item in items:
            await self.session.refresh(item, ["creator"])
        return items, total

    async def get_by_suite(self, suite_id: uuid.UUID) -> list:
        """Get all test runs for a given test suite."""
        stmt = self._base_query().where(self.model.test_suite_id == suite_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_status(self, status: str) -> list:
        """Get all test runs with a given status."""
        stmt = self._base_query().where(self.model.status == status)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
