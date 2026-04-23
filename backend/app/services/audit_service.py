"""Audit service: immutable action logging, filtering, retrieval."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.audit_log import AuditLog
from app.repositories.audit_log_repository import AuditLogRepository


def _parse_dt(value: str | None) -> datetime | None:
    """Parse an ISO-8601 string (or YYYY-MM-DD date) safely; returns None on failure."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            return datetime.strptime(value, "%Y-%m-%d")
        except ValueError:
            return None


class AuditService:
    """Immutable audit trail logging and retrieval."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit_repo = AuditLogRepository(session)

    # ── Write ──────────────────────────────────────────────────────────────

    async def log_action(
        self,
        *,
        entity_type: str,
        entity_id: str | None,
        action: str,
        user_id: str | None,
        old_values: dict[str, Any] | None = None,
        new_values: dict[str, Any] | None = None,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> Any:
        """Create an immutable audit log record."""
        data = {
            "entity_type": entity_type,
            "entity_id": entity_id or "",
            "action": action,
            "user_id": user_id,
            "old_values": old_values,
            "new_values": new_values,
            "ip_address": ip_address,
            "user_agent": user_agent,
        }
        return await self.audit_repo.create(data)

    # ── Read ───────────────────────────────────────────────────────────────

    def _serialize(self, log: Any) -> dict:
        return {
            "id": log.id,
            "entity_type": log.entity_type,
            "entity_id": log.entity_id,
            "action": log.action,
            "old_values": log.old_values,
            "new_values": log.new_values,
            "user_id": log.user_id,
            "user_name": log.user.full_name if log.user else None,
            "user_email": log.user.email if log.user else None,
            "ip_address": log.ip_address,
            "user_agent": log.user_agent,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }

    async def list_audit_logs(
        self,
        *,
        entity_type: str | None = None,
        entity_id: str | None = None,
        action: str | None = None,
        user_id: str | None = None,
        start_date: str | None = None,
        end_date: str | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[dict], int]:
        """List audit logs with filters. Returns (serialized_items, total)."""
        stmt = select(AuditLog).options(selectinload(AuditLog.user))

        if entity_type:
            stmt = stmt.where(AuditLog.entity_type == entity_type)
        if entity_id:
            stmt = stmt.where(AuditLog.entity_id == entity_id)
        if action:
            stmt = stmt.where(AuditLog.action == action.upper())
        if user_id:
            stmt = stmt.where(AuditLog.user_id == user_id)

        date_from = _parse_dt(start_date)
        date_to = _parse_dt(end_date)
        if date_from:
            stmt = stmt.where(AuditLog.created_at >= date_from)
        if date_to:
            # include the whole end-day if only a date was provided
            if date_to.time() == datetime.min.time():
                end = date_to.replace(hour=23, minute=59, second=59)
            else:
                end = date_to
            stmt = stmt.where(AuditLog.created_at <= end)

        if search:
            pattern = f"%{search}%"
            stmt = stmt.where(
                or_(
                    AuditLog.entity_type.ilike(pattern),
                    AuditLog.entity_id.ilike(pattern),
                    AuditLog.action.ilike(pattern),
                )
            )

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = (await self.session.execute(count_stmt)).scalar_one()

        stmt = (
            stmt.order_by(AuditLog.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await self.session.execute(stmt)
        items = [self._serialize(log) for log in result.scalars().all()]
        return items, total

    async def get_entity_audit_trail(
        self,
        *,
        entity_type: str,
        entity_id: str,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[dict], int]:
        """Get the full audit trail for a specific entity."""
        return await self.list_audit_logs(
            entity_type=entity_type,
            entity_id=entity_id,
            page=page,
            page_size=page_size,
        )

    async def stats(self, days: int = 7) -> dict[str, Any]:
        """Counts by action for the last N days."""
        from datetime import timedelta

        since = datetime.utcnow() - timedelta(days=days)
        stmt = (
            select(AuditLog.action, func.count(AuditLog.id))
            .where(AuditLog.created_at >= since)
            .group_by(AuditLog.action)
        )
        result = await self.session.execute(stmt)
        counts = {row[0]: row[1] for row in result.all()}

        total_stmt = select(func.count(AuditLog.id)).where(AuditLog.created_at >= since)
        total = (await self.session.execute(total_stmt)).scalar_one()

        return {"days": days, "total": total, "by_action": counts}
