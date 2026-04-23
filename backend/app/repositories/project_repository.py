"""Repository for Project entity operations."""

import uuid

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.project import Project
from app.repositories.base import BaseRepository


class ProjectRepository(BaseRepository[Project]):
    """Repository for Project-specific database operations."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(Project, session)

    async def get_all_with_creator(self, **kwargs) -> tuple[list[dict], int]:
        """Get all projects with creator info included."""
        # Extract search from filters and apply as LIKE on name/code/description
        filters = kwargs.get("filters")
        search_term = None
        if filters and "search" in filters:
            search_term = filters.pop("search")
            if not filters:
                kwargs["filters"] = None

        items, total = await super().get_all(**kwargs)

        # If search_term provided, we need to re-query with LIKE
        if search_term:
            like_pattern = f"%{search_term}%"
            stmt = self._base_query()
            stmt = stmt.where(
                or_(
                    Project.name.ilike(like_pattern),
                    Project.code.ilike(like_pattern),
                    Project.description.ilike(like_pattern),
                )
            )
            # Re-apply remaining filters
            if kwargs.get("filters"):
                for field_name, value in kwargs["filters"].items():
                    column = getattr(Project, field_name, None)
                    if column is not None and value is not None:
                        stmt = stmt.where(column == value)
            # Count
            count_stmt = select(func.count()).select_from(stmt.subquery())
            total_result = await self.session.execute(count_stmt)
            total = total_result.scalar_one()
            # Sort
            sort_by = kwargs.get("sort_by", "created_at")
            sort_order = kwargs.get("sort_order", "desc")
            sort_column = getattr(Project, sort_by, None)
            if sort_column is not None:
                stmt = stmt.order_by(
                    sort_column.asc() if sort_order == "asc" else sort_column.desc()
                )
            # Paginate
            page = kwargs.get("page", 1)
            page_size = kwargs.get("page_size", 20)
            stmt = stmt.offset((page - 1) * page_size).limit(page_size)
            result = await self.session.execute(stmt)
            items = list(result.scalars().all())
        results = []
        for item in items:
            await self.session.refresh(item, ["creator"])
            proj_dict = {
                "id": item.id,
                "name": item.name,
                "code": item.code,
                "description": item.description,
                "category": item.category,
                "is_active": item.is_active,
                "created_by": item.created_by,
                "created_at": item.created_at.isoformat() if item.created_at else None,
                "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            }
            if item.creator:
                proj_dict["creator_name"] = item.creator.full_name
                proj_dict["creator_email"] = item.creator.email
            results.append(proj_dict)
        return results, total

    async def get_by_code(self, code: str) -> Project | None:
        """Get a project by its unique code."""
        stmt = self._base_query().where(Project.code == code)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_with_modules(self, project_id: uuid.UUID) -> Project | None:
        """Get a project with its modules eagerly loaded."""
        stmt = (
            self._base_query()
            .options(joinedload(Project.modules))
            .where(Project.id == project_id)
        )
        result = await self.session.execute(stmt)
        return result.unique().scalar_one_or_none()
