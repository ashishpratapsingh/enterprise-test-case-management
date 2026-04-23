"""Epic service: CRUD operations."""

import uuid
from datetime import date
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.repositories.epic_repository import EpicRepository


def _parse_date(value: Any) -> date | None:
    """Convert a date string (YYYY-MM-DD) to a date object, or return None."""
    if value is None or value == "":
        return None
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value))


class EpicService:
    """Manages epic lifecycle."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.epic_repo = EpicRepository(session)

    def _normalize(self, data: dict[str, Any]) -> dict[str, Any]:
        """Normalize date fields and strip empty strings."""
        if "start_date" in data:
            data["start_date"] = _parse_date(data["start_date"])
        if "due_date" in data:
            data["due_date"] = _parse_date(data["due_date"])
        if "assigned_to" in data and not data["assigned_to"]:
            data["assigned_to"] = None
        return data

    async def list_epics(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        filters: dict[str, Any] | None = None,
    ) -> tuple[list, int]:
        return await self.epic_repo.get_all_with_users(
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order,
            filters=filters,
        )

    async def get_epic(self, epic_id: uuid.UUID) -> Any:
        epic = await self.epic_repo.get_by_id(epic_id)
        if epic is None:
            raise NotFoundError(f"Epic with id '{epic_id}' not found")
        return epic

    async def create_epic(self, data: dict[str, Any]) -> Any:
        data = self._normalize(data)
        if data.get("title") and data.get("project_id"):
            existing = await self.epic_repo.get_by_title_and_project(
                title=data["title"], project_id=data["project_id"]
            )
            if existing:
                raise ConflictError(
                    "An epic with this title already exists in the selected project"
                )
        return await self.epic_repo.create(data)

    async def update_epic(self, epic_id: uuid.UUID, data: dict[str, Any]) -> Any:
        data = self._normalize(data)
        epic = await self.epic_repo.update(epic_id, data)
        if epic is None:
            raise NotFoundError(f"Epic with id '{epic_id}' not found")
        return epic

    async def delete_epic(self, epic_id: uuid.UUID) -> Any:
        epic = await self.epic_repo.soft_delete(epic_id)
        if epic is None:
            raise NotFoundError(f"Epic with id '{epic_id}' not found")
        return epic
