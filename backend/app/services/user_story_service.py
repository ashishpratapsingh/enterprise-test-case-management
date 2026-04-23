"""UserStory service: CRUD operations."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.repositories.user_story_repository import UserStoryRepository


class UserStoryService:
    """Manages user story lifecycle."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = UserStoryRepository(session)

    def _normalize(self, data: dict[str, Any]) -> dict[str, Any]:
        """Strip empty strings to None."""
        for key in ("epic_id", "project_id", "assigned_to", "description", "acceptance_criteria"):
            if key in data and not data[key]:
                data[key] = None
        if "story_points" in data:
            val = data["story_points"]
            data["story_points"] = int(val) if val is not None and val != "" else None
        return data

    async def list_user_stories(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        filters: dict[str, Any] | None = None,
    ) -> tuple[list, int]:
        return await self.repo.get_all_with_users(
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order,
            filters=filters,
        )

    async def get_user_story(self, story_id: uuid.UUID) -> Any:
        story = await self.repo.get_by_id(story_id)
        if story is None:
            raise NotFoundError(f"User story with id '{story_id}' not found")
        return story

    async def create_user_story(self, data: dict[str, Any]) -> Any:
        data = self._normalize(data)
        return await self.repo.create(data)

    async def update_user_story(self, story_id: uuid.UUID, data: dict[str, Any]) -> Any:
        data = self._normalize(data)
        story = await self.repo.update(story_id, data)
        if story is None:
            raise NotFoundError(f"User story with id '{story_id}' not found")
        return story

    async def delete_user_story(self, story_id: uuid.UUID) -> Any:
        story = await self.repo.soft_delete(story_id)
        if story is None:
            raise NotFoundError(f"User story with id '{story_id}' not found")
        return story
