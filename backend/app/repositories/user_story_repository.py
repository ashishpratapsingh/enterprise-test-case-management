"""Repository for UserStory entity operations."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.base import BaseRepository


class UserStoryRepository(BaseRepository):
    """Repository for UserStory-specific database operations."""

    def __init__(self, session: AsyncSession) -> None:
        from app.models.user_story import UserStory

        super().__init__(UserStory, session)

    async def get_all_with_users(self, **kwargs) -> tuple[list[dict], int]:
        """Get all user stories with creator, assignee, epic, and project info."""
        from app.models.user_story import UserStory

        filters = kwargs.get("filters")
        search_term = None
        if filters and "search" in filters:
            search_term = filters.pop("search")
            if not filters:
                kwargs["filters"] = None

        items, total = await super().get_all(**kwargs)

        if search_term:
            like_pattern = f"%{search_term}%"
            stmt = self._base_query()
            stmt = stmt.where(UserStory.title.ilike(like_pattern))
            if kwargs.get("filters"):
                for field_name, value in kwargs["filters"].items():
                    column = getattr(UserStory, field_name, None)
                    if column is not None and value is not None:
                        stmt = stmt.where(column == value)
            count_stmt = select(func.count()).select_from(stmt.subquery())
            total_result = await self.session.execute(count_stmt)
            total = total_result.scalar_one()
            sort_by = kwargs.get("sort_by", "created_at")
            sort_order = kwargs.get("sort_order", "desc")
            sort_column = getattr(UserStory, sort_by, None)
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
            await self.session.refresh(item, ["creator", "assignee", "epic", "project"])
            story_dict = {
                "id": item.id,
                "epic_id": item.epic_id,
                "epic_title": item.epic.title if item.epic else None,
                "project_id": item.project_id,
                "project_name": item.project.name if item.project else None,
                "project_code": item.project.code if item.project else None,
                "project_is_active": item.project.is_active if item.project else None,
                "title": item.title,
                "description": item.description,
                "acceptance_criteria": item.acceptance_criteria,
                "priority": item.priority,
                "status": item.status,
                "story_points": item.story_points,
                "assigned_to": item.assigned_to,
                "assignee": item.assignee.full_name if item.assignee else None,
                "created_by": item.created_by,
                "created_by_name": item.creator.full_name if item.creator else None,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            }
            results.append(story_dict)
        return results, total
