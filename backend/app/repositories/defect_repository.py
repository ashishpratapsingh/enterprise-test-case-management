"""Repository for Defect entity operations."""

import uuid
from typing import Any

from sqlalchemy import desc, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.repositories.base import BaseRepository
from app.utils.db_search import build_search_filter


class DefectRepository(BaseRepository):
    """Repository for Defect-specific database operations."""

    def __init__(self, session: AsyncSession) -> None:
        from app.models.defect import Defect

        super().__init__(Defect, session)

    def _serialize(self, item: Any) -> dict:
        """Serialize a defect ORM object with related project/test_case info."""
        result = {
            "id": item.id,
            "defect_id": item.defect_id,
            "title": item.title,
            "description": item.description,
            "project_id": item.project_id,
            "severity": item.severity,
            "priority": item.priority,
            "status": item.status,
            "reported_by": item.reported_by,
            "assigned_to": item.assigned_to,
            "assigned_to_name": item.assignee.full_name if item.assignee else None,
            "epic_id": item.epic_id,
            "user_story_id": item.user_story_id,
            "test_case_id": item.test_case_id,
            "test_execution_id": item.test_execution_id,
            "step_number": item.step_number,
            "jira_ticket_id": item.jira_ticket_id,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            "is_deleted": item.is_deleted,
        }
        # Add project code
        if item.project:
            result["project_code"] = item.project.code
            result["project_name"] = item.project.name
        else:
            result["project_code"] = None
            result["project_name"] = None
        # Add epic/story titles
        result["epic_title"] = item.epic.title if item.epic else None
        result["user_story_title"] = item.user_story.title if item.user_story else None
        # Add reporter name
        if item.reporter:
            result["created_by_name"] = item.reporter.full_name
        else:
            result["created_by_name"] = None
        # Add test case display ID (TC-XXXXX)
        if item.test_case:
            result["test_case_display_id"] = item.test_case.test_case_id
            result["test_case_title"] = item.test_case.title
        else:
            result["test_case_display_id"] = None
            result["test_case_title"] = None
        return result

    async def get_all_with_relations(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        filters: dict[str, Any] | None = None,
        search: str | None = None,
    ) -> tuple[list[dict], int]:
        """Get all defects with eager-loaded project and test_case."""
        stmt = (
            self._base_query()
            .options(
                selectinload(self.model.project),
                selectinload(self.model.epic),
                selectinload(self.model.user_story),
                selectinload(self.model.test_case),
                selectinload(self.model.reporter),
                selectinload(self.model.assignee),
            )
        )

        if filters:
            for field_name, value in filters.items():
                column = getattr(self.model, field_name, None)
                if column is not None and value is not None:
                    if isinstance(value, list):
                        stmt = stmt.where(column.in_(value))
                    else:
                        stmt = stmt.where(column == value)

        if search:
            # Postgres → websearch_to_tsquery; SQLite → OR of LIKEs.
            search_clause = build_search_filter(
                self.model,
                search,
                ["title", "description"],
                self.session.get_bind(),
            )
            if search_clause is not None:
                stmt = stmt.where(search_clause)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar_one()

        sort_column = getattr(self.model, sort_by, None)
        if sort_column is not None:
            if sort_order.lower() == "asc":
                stmt = stmt.order_by(sort_column.asc())
            else:
                stmt = stmt.order_by(sort_column.desc())

        offset = (page - 1) * page_size
        stmt = stmt.offset(offset).limit(page_size)

        result = await self.session.execute(stmt)
        items = [self._serialize(item) for item in result.scalars().all()]
        return items, total

    async def get_by_project(self, project_id: uuid.UUID) -> list:
        """Get all defects belonging to a project."""
        stmt = self._base_query().where(self.model.project_id == project_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_by_status(self, status: str) -> list:
        """Get all defects with a given status."""
        stmt = self._base_query().where(self.model.status == status)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_next_defect_id(self, project_code: str | None = None) -> str:
        """Generate the next sequential defect ID.

        Format: BUG-{PROJECT_CODE}-{SEQUENCE} (e.g. BUG-PROJ-0001)
        """
        prefix = f"BUG-{project_code}-" if project_code else "BUG-"

        stmt = (
            select(self.model.defect_id)
            .where(self.model.defect_id.isnot(None))
            .where(self.model.defect_id.like(f"{prefix}%"))
            .order_by(desc(self.model.defect_id))
            .limit(1)
        )
        result = await self.session.execute(stmt)
        last_id = result.scalar_one_or_none()

        if last_id is None:
            return f"{prefix}0001"

        try:
            numeric_part = int(last_id.rsplit("-", 1)[1])
            next_number = numeric_part + 1
        except (IndexError, ValueError):
            next_number = 1

        return f"{prefix}{next_number:04d}"
