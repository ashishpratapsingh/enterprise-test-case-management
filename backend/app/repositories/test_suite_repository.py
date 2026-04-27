"""Repository for TestSuite entity operations."""

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.repositories.base import BaseRepository
from app.utils.db_search import build_search_filter


def _safe_user(user: Any) -> dict | None:
    """Return only public User fields — never leak password hashes or
    reset tokens through nested relationships."""
    if user is None:
        return None
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
    }


def _safe_suite_case(sc: Any) -> dict:
    """Slim view of a TestSuiteCase association row used by list responses."""
    return {
        "id": getattr(sc, "id", None),
        "test_suite_id": sc.test_suite_id,
        "test_case_id": sc.test_case_id,
        "order": getattr(sc, "order", None),
    }


class TestSuiteRepository(BaseRepository):
    """Repository for TestSuite-specific database operations."""

    def __init__(self, session: AsyncSession) -> None:
        from app.models.test_suite import TestSuite

        super().__init__(TestSuite, session)

    def _serialize(self, item: Any) -> dict:
        return {
            "id": item.id,
            "name": item.name,
            "description": item.description,
            "project_id": item.project_id,
            "release_id": item.release_id,
            "is_active": item.is_active,
            "created_by": item.created_by,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            "is_deleted": item.is_deleted,
            "creator": _safe_user(getattr(item, "creator", None)),
            "test_suite_cases": [
                _safe_suite_case(sc) for sc in getattr(item, "test_suite_cases", []) or []
            ],
        }

    async def get_all(self, **kwargs) -> tuple[list, int]:
        """Override to eagerly load test_suite_cases (excluding deleted
        test cases) and to honour the ``search`` free-text filter, which
        the base equality matcher would silently drop.
        """
        from app.models.test_case import TestCase

        filters: dict[str, Any] = dict(kwargs.pop("filters", None) or {})
        search = filters.pop("search", None)

        if not search:
            kwargs["filters"] = filters or None
            items, total = await super().get_all(**kwargs)
        else:
            page = kwargs.get("page", 1)
            page_size = kwargs.get("page_size", 20)
            sort_by = kwargs.get("sort_by", "created_at")
            sort_order = kwargs.get("sort_order", "desc")
            include_deleted = kwargs.get("include_deleted", False)

            stmt = self._base_query(include_deleted=include_deleted)
            for field_name, value in filters.items():
                column = getattr(self.model, field_name, None)
                if column is not None and value is not None:
                    stmt = stmt.where(column == value)

            search_clause = build_search_filter(
                self.model,
                search,
                ["name", "description"],
                self.session.get_bind(),
            )
            if search_clause is not None:
                stmt = stmt.where(search_clause)

            count_stmt = select(func.count()).select_from(stmt.subquery())
            total = (await self.session.execute(count_stmt)).scalar_one()

            sort_col = getattr(self.model, sort_by, None)
            if sort_col is not None:
                stmt = stmt.order_by(
                    sort_col.asc() if sort_order == "asc" else sort_col.desc()
                )
            stmt = stmt.offset((page - 1) * page_size).limit(page_size)
            items = list((await self.session.execute(stmt)).scalars().all())

        for item in items:
            await self.session.refresh(item, ["test_suite_cases", "creator"])
            # Filter out associations pointing to soft-deleted test cases
            valid_cases = []
            for sc in item.test_suite_cases:
                tc = await self.session.get(TestCase, sc.test_case_id)
                if tc and not getattr(tc, 'is_deleted', False):
                    valid_cases.append(sc)
            item.test_suite_cases = valid_cases
        return [self._serialize(i) for i in items], total

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
