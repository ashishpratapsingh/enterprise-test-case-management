"""Repository for Epic entity operations."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.base import BaseRepository


class EpicRepository(BaseRepository):
    """Repository for Epic-specific database operations."""

    def __init__(self, session: AsyncSession) -> None:
        from app.models.epic import Epic

        super().__init__(Epic, session)

    async def get_all_with_users(self, **kwargs) -> tuple[list[dict], int]:
        """Get all epics with creator and assignee info."""
        from app.models.epic import Epic

        filters = kwargs.get("filters")
        search_term = None
        unassigned = False
        if filters and "search" in filters:
            search_term = filters.pop("search")
        if filters and filters.get("assigned_to") == "unassigned":
            unassigned = True
            filters.pop("assigned_to")
        if filters and not filters:
            kwargs["filters"] = None

        items, total = await super().get_all(**kwargs)

        if search_term or unassigned:
            stmt = self._base_query()
            if search_term:
                like_pattern = f"%{search_term}%"
                stmt = stmt.where(Epic.title.ilike(like_pattern))
            if unassigned:
                stmt = stmt.where(Epic.assigned_to.is_(None))
            if kwargs.get("filters"):
                for field_name, value in kwargs["filters"].items():
                    column = getattr(Epic, field_name, None)
                    if column is not None and value is not None:
                        stmt = stmt.where(column == value)
            count_stmt = select(func.count()).select_from(stmt.subquery())
            total_result = await self.session.execute(count_stmt)
            total = total_result.scalar_one()
            sort_by = kwargs.get("sort_by", "created_at")
            sort_order = kwargs.get("sort_order", "desc")
            sort_column = getattr(Epic, sort_by, None)
            if sort_column is not None:
                stmt = stmt.order_by(
                    sort_column.asc() if sort_order == "asc" else sort_column.desc()
                )
            page = kwargs.get("page", 1)
            page_size = kwargs.get("page_size", 20)
            stmt = stmt.offset((page - 1) * page_size).limit(page_size)
            result = await self.session.execute(stmt)
            items = list(result.scalars().all())
        results = []
        for item in items:
            await self.session.refresh(item, ["creator", "assignee", "project"])
            epic_dict = {
                "id": item.id,
                "project_id": item.project_id,
                "project_name": item.project.name if item.project else None,
                "project_code": item.project.code if item.project else None,
                "is_project_active": item.project.is_active if item.project else None,
                "title": item.title,
                "labels": item.labels,
                "start_date": str(item.start_date) if item.start_date else None,
                "due_date": str(item.due_date) if item.due_date else None,
                "priority": item.priority,
                "assigned_to": item.assigned_to,
                "assignee": item.assignee.full_name if item.assignee else None,
                "created_by": item.created_by,
                "created_by_name": item.creator.full_name if item.creator else None,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            }
            results.append(epic_dict)
        return results, total

    async def get_by_title_and_project(self, title: str, project_id: str) -> "Epic | None":
        """Check if an epic with the same title exists in the given project."""
        from app.models.epic import Epic

        stmt = self._base_query().where(
            func.lower(Epic.title) == title.lower(),
            Epic.project_id == project_id,
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
