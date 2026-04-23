"""Repository for AuditLog entity operations.

This repository intentionally omits update and delete methods
because audit logs are immutable records.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.base import BaseRepository


class AuditLogRepository(BaseRepository):
    """Repository for AuditLog operations.

    Only create and read operations are supported.
    Audit logs are immutable - no update or delete.
    """

    def __init__(self, session: AsyncSession) -> None:
        from app.models.audit_log import AuditLog

        super().__init__(AuditLog, session)

    async def create(self, data: dict[str, Any]):
        """Create an immutable audit log record."""
        entity = self.model(**data)
        self.session.add(entity)
        await self.session.flush()
        await self.session.refresh(entity)
        return entity

    async def get_logs(
        self,
        *,
        entity_type: str | None = None,
        entity_id: uuid.UUID | None = None,
        action: str | None = None,
        user_id: uuid.UUID | None = None,
        date_from: datetime | None = None,
        date_to: datetime | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list, int]:
        """Get audit logs with flexible filtering.

        Args:
            entity_type: Filter by entity type (e.g., 'test_case', 'project').
            entity_id: Filter by the specific entity UUID.
            action: Filter by action performed (e.g., 'create', 'update', 'delete').
            user_id: Filter by the user who performed the action.
            date_from: Filter logs created on or after this datetime.
            date_to: Filter logs created on or before this datetime.
            page: Page number (1-indexed).
            page_size: Number of records per page.

        Returns:
            A tuple of (list of audit logs, total count).
        """
        stmt = select(self.model)

        if entity_type is not None:
            stmt = stmt.where(self.model.entity_type == entity_type)
        if entity_id is not None:
            stmt = stmt.where(self.model.entity_id == entity_id)
        if action is not None:
            stmt = stmt.where(self.model.action == action)
        if user_id is not None:
            stmt = stmt.where(self.model.user_id == user_id)
        if date_from is not None:
            stmt = stmt.where(self.model.created_at >= date_from)
        if date_to is not None:
            stmt = stmt.where(self.model.created_at <= date_to)

        # Count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar_one()

        # Order and paginate
        stmt = stmt.order_by(self.model.created_at.desc())
        offset = (page - 1) * page_size
        stmt = stmt.offset(offset).limit(page_size)

        result = await self.session.execute(stmt)
        items = list(result.scalars().all())

        return items, total

    async def update(self, *args, **kwargs):
        """Audit logs are immutable. Updates are not permitted."""
        raise NotImplementedError("Audit logs are immutable and cannot be updated.")

    async def soft_delete(self, *args, **kwargs):
        """Audit logs are immutable. Deletion is not permitted."""
        raise NotImplementedError("Audit logs are immutable and cannot be deleted.")
