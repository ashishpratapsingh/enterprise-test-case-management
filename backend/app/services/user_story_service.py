"""UserStory service: CRUD operations."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.repositories.user_story_repository import UserStoryRepository

# Agile estimation Fibonacci scale up to 13. Used for both per-row
# create/update and bulk updates so the constraint is consistent
# across every entry point. Values outside this set are rejected.
ALLOWED_STORY_POINTS: frozenset[int] = frozenset({0, 1, 2, 3, 5, 8, 13})


class UserStoryService:
    """Manages user story lifecycle."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = UserStoryRepository(session)

    def _normalize(self, data: dict[str, Any]) -> dict[str, Any]:
        """Strip empty strings to None and validate story-points domain."""
        for key in ("epic_id", "project_id", "assigned_to", "description", "acceptance_criteria"):
            if key in data and not data[key]:
                data[key] = None
        if "story_points" in data:
            val = data["story_points"]
            if val is None or val == "":
                data["story_points"] = None
            else:
                try:
                    parsed = int(val)
                except (TypeError, ValueError):
                    raise ValidationError(
                        f"Invalid story_points value '{val}' — must be an integer"
                    )
                if parsed not in ALLOWED_STORY_POINTS:
                    raise ValidationError(
                        f"Invalid story_points value {parsed}. Allowed values: "
                        f"{sorted(ALLOWED_STORY_POINTS)}"
                    )
                data["story_points"] = parsed
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

    # ── Bulk operations ─────────────────────────────────────────────────
    #
    # Same partial-success contract as the other bulk endpoints:
    # per-row failures (NotFound, validation) land in ``failed`` and
    # never abort the batch.

    async def bulk_delete(self, story_ids: list[Any]) -> dict[str, list]:
        succeeded: list[str] = []
        failed: list[dict[str, str]] = []
        for sid in story_ids:
            try:
                await self.delete_user_story(sid)
                succeeded.append(str(sid))
            except NotFoundError as e:
                failed.append({"id": str(sid), "error": str(e)})
        return {"succeeded": succeeded, "failed": failed}

    async def bulk_update(
        self,
        story_ids: list[Any],
        *,
        status: str | None = None,
        priority: str | None = None,
        epic_id: str | None = None,
        clear_epic: bool = False,
        assigned_to: str | None = None,
        unassign: bool = False,
        story_points: int | None = None,
        clear_story_points: bool = False,
    ) -> dict[str, list]:
        """Plain-field bulk edit for user stories.

        ``clear_*`` flags force the matching column to null. Without
        them, ``None`` in this signature means "leave unchanged"
        (sender omitted the key).
        """
        update_data: dict[str, Any] = {}
        if status is not None:
            update_data["status"] = status
        if priority is not None:
            update_data["priority"] = priority
        if clear_epic:
            update_data["epic_id"] = None
        elif epic_id is not None:
            update_data["epic_id"] = epic_id
        if unassign:
            update_data["assigned_to"] = None
        elif assigned_to is not None:
            update_data["assigned_to"] = assigned_to
        if clear_story_points:
            update_data["story_points"] = None
        elif story_points is not None:
            # Validate once before the loop — a bad value should fail
            # the whole call, not flag every row separately.
            if story_points not in ALLOWED_STORY_POINTS:
                raise ValidationError(
                    f"Invalid story_points value {story_points}. Allowed values: "
                    f"{sorted(ALLOWED_STORY_POINTS)}"
                )
            update_data["story_points"] = story_points

        if not update_data:
            raise ValidationError("At least one field must be provided to bulk_update")

        succeeded: list[str] = []
        failed: list[dict[str, str]] = []
        for sid in story_ids:
            try:
                await self.update_user_story(sid, update_data)
                succeeded.append(str(sid))
            except (NotFoundError, ValidationError) as e:
                failed.append({"id": str(sid), "error": str(e)})
        return {"succeeded": succeeded, "failed": failed}
