"""Repository for TestCase entity operations."""

import uuid
from typing import Any

from sqlalchemy import String, cast, desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.base import BaseRepository


def _safe_user(user: Any) -> dict | None:
    """Return only public User fields — never leak password hashes or reset
    tokens through nested relationships."""
    if user is None:
        return None
    return {
        "id": user.id,
        "full_name": user.full_name,
        "email": user.email,
    }


class TestCaseRepository(BaseRepository):
    """Repository for TestCase-specific database operations."""

    def __init__(self, session: AsyncSession) -> None:
        from app.models.test_case import TestCase

        super().__init__(TestCase, session)

    def _serialize(self, item: Any) -> dict:
        """Build the wire-safe dict for a TestCase row. Relationships are
        expected to be refreshed by the caller."""
        return {
            "id": item.id,
            "test_case_id": item.test_case_id,
            "title": item.title,
            "description": item.description,
            "preconditions": item.preconditions,
            "steps": item.steps,
            "expected_result": item.expected_result,
            "priority": item.priority,
            "type": item.type,
            "status": item.status,
            "automation_status": item.automation_status,
            "isAutomated": item.automation_status == "Automated",
            "version": item.version,
            "tags": item.tags,
            "project_id": item.project_id,
            "project_code": item.project.code if item.project else None,
            "project_name": item.project.name if item.project else None,
            "project_is_active": item.project.is_active if item.project else None,
            "epic_id": item.epic_id,
            "epic_title": item.epic.title if item.epic else None,
            "user_story_id": item.user_story_id,
            "user_story_title": item.user_story.title if item.user_story else None,
            "module_id": item.module_id,
            "assigned_to": item.assigned_to,
            "assigned_to_name": item.assignee.full_name if item.assignee else None,
            "assignee": _safe_user(getattr(item, "assignee", None)),
            "created_by": item.created_by,
            "created_by_name": item.creator.full_name if item.creator else None,
            "createdBy": _safe_user(getattr(item, "creator", None)),
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "updated_at": item.updated_at.isoformat() if getattr(item, "updated_at", None) else None,
        }

    async def get_by_id_enriched(self, entity_id: uuid.UUID) -> dict | None:
        """Load a single test case with all dropdown-facing relationships
        refreshed and return it serialized. Safe to send to the frontend.
        Returns None if not found."""
        item = await self.get_by_id(entity_id)
        if item is None:
            return None
        await self.session.refresh(
            item, ["project", "epic", "user_story", "creator", "assignee"]
        )
        return self._serialize(item)

    async def get_all(self, **kwargs) -> tuple[list, int]:
        """Override to enrich test cases with project/epic/user_story info."""
        items, total = await super().get_all(**kwargs)
        results = []
        for item in items:
            await self.session.refresh(item, ["project", "epic", "user_story", "creator", "assignee"])
            results.append(self._serialize(item))
        return results, total

    async def get_by_project(self, project_id: uuid.UUID) -> list:
        """Get all test cases belonging to a project."""
        stmt = self._base_query().where(self.model.project_id == project_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_module(self, module_id: uuid.UUID) -> list:
        """Get all test cases belonging to a module."""
        stmt = self._base_query().where(self.model.module_id == module_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_test_case_id(self, test_case_id: str):
        """Get a test case by its human-readable test_case_id (e.g., TC-00001)."""
        stmt = self._base_query().where(self.model.test_case_id == test_case_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def search(
        self,
        *,
        title: str | None = None,
        tags: list[str] | None = None,
        status: str | None = None,
        test_type: str | None = None,
        project_id: uuid.UUID | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list, int]:
        """Search test cases by title, tags, status, and/or type.

        Returns:
            A tuple of (matching test cases, total count).
        """
        stmt = self._base_query()

        if project_id is not None:
            stmt = stmt.where(self.model.project_id == project_id)

        if title is not None:
            stmt = stmt.where(self.model.title.ilike(f"%{title}%"))

        if status is not None:
            stmt = stmt.where(self.model.status == status)

        if test_type is not None:
            stmt = stmt.where(self.model.type == test_type)

        if tags is not None:
            # Assumes tags is stored as a JSON/ARRAY column; filter for overlap
            for tag in tags:
                stmt = stmt.where(
                    cast(self.model.tags, String).ilike(f"%{tag}%")
                )

        # Count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar_one()

        # Pagination
        offset = (page - 1) * page_size
        stmt = stmt.order_by(self.model.created_at.desc()).offset(offset).limit(page_size)

        result = await self.session.execute(stmt)
        items = list(result.scalars().all())

        return items, total

    async def get_next_test_case_id(self, project_code: str | None = None) -> str:
        """Generate the next sequential test case ID.

        Format: TC-{PROJECT_CODE}-{SEQUENCE} (e.g. TC-PROJ-0001)
        Falls back to TC-0001 if no project code is provided.
        """
        prefix = f"TC-{project_code}-" if project_code else "TC-"

        stmt = (
            select(self.model.test_case_id)
            .where(self.model.test_case_id.isnot(None))
            .where(self.model.test_case_id.like(f"{prefix}%"))
            .order_by(desc(self.model.test_case_id))
            .limit(1)
        )
        result = await self.session.execute(stmt)
        last_id = result.scalar_one_or_none()

        if last_id is None:
            return f"{prefix}0001"

        # Extract the numeric part (last segment after the final hyphen)
        try:
            numeric_part = int(last_id.rsplit("-", 1)[1])
            next_number = numeric_part + 1
        except (IndexError, ValueError):
            next_number = 1

        return f"{prefix}{next_number:04d}"
