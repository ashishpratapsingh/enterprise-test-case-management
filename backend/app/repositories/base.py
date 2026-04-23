"""Base repository with generic async CRUD operations."""

import uuid
from typing import Any, Generic, TypeVar

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base

T = TypeVar("T", bound=Base)


class BaseRepository(Generic[T]):
    """Generic async CRUD repository for SQLAlchemy models.

    Provides common database operations with soft-delete support,
    pagination, filtering, and sorting.
    """

    def __init__(self, model: type[T], session: AsyncSession) -> None:
        self.model = model
        self.session = session

    def _base_query(self, include_deleted: bool = False) -> Select:
        """Return base select query, filtering out soft-deleted records by default."""
        stmt = select(self.model)
        if not include_deleted and getattr(self.model, "is_deleted", None) is not None:
            stmt = stmt.where(self.model.is_deleted == False)  # noqa: E712
        return stmt

    async def get_by_id(
        self,
        entity_id: uuid.UUID,
        include_deleted: bool = False,
    ) -> T | None:
        """Get a single entity by its primary key."""
        stmt = self._base_query(include_deleted=include_deleted).where(
            self.model.id == entity_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_all(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        filters: dict[str, Any] | None = None,
        include_deleted: bool = False,
    ) -> tuple[list[T], int]:
        """Get all entities with pagination, sorting, and filtering.

        Returns:
            A tuple of (list of entities, total count).
        """
        stmt = self._base_query(include_deleted=include_deleted)

        # Apply filters
        if filters:
            for field_name, value in filters.items():
                column = getattr(self.model, field_name, None)
                if column is not None and value is not None:
                    if isinstance(value, list):
                        stmt = stmt.where(column.in_(value))
                    else:
                        stmt = stmt.where(column == value)

        # Count total before pagination
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar_one()

        # Apply sorting
        sort_column = getattr(self.model, sort_by, None)
        if sort_column is not None:
            if sort_order.lower() == "asc":
                stmt = stmt.order_by(sort_column.asc())
            else:
                stmt = stmt.order_by(sort_column.desc())

        # Apply pagination
        offset = (page - 1) * page_size
        stmt = stmt.offset(offset).limit(page_size)

        result = await self.session.execute(stmt)
        entities = list(result.scalars().all())

        return entities, total

    async def create(self, data: dict[str, Any]) -> T:
        """Create a new entity from a dictionary of field values."""
        entity = self.model(**data)
        self.session.add(entity)
        await self.session.flush()
        await self.session.refresh(entity)
        return entity

    async def update(
        self,
        entity_id: uuid.UUID,
        data: dict[str, Any],
    ) -> T | None:
        """Update an existing entity by ID.

        Returns:
            The updated entity, or None if not found.
        """
        entity = await self.get_by_id(entity_id)
        if entity is None:
            return None

        for field, value in data.items():
            if hasattr(entity, field):
                setattr(entity, field, value)

        await self.session.flush()
        await self.session.refresh(entity)
        return entity

    async def soft_delete(self, entity_id: uuid.UUID) -> T | None:
        """Soft-delete an entity by setting is_deleted = True.

        Returns:
            The soft-deleted entity, or None if not found.
        """
        entity = await self.get_by_id(entity_id)
        if entity is None:
            return None

        entity.is_deleted = True  # type: ignore[assignment]
        await self.session.flush()
        await self.session.refresh(entity)
        return entity
