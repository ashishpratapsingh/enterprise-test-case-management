"""User story management routes."""

from fastapi import APIRouter, Body, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, success_response
from app.core.exceptions import ValidationError
from app.services.user_story_service import UserStoryService
from app.utils.helpers import build_filters

router = APIRouter(prefix="/user-stories", tags=["User Stories"])


# ── Bulk operation schemas ─────────────────────────────────────────────────


class _BulkIds(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500, description="User story IDs")


class _BulkUpdate(_BulkIds):
    """Plain-field bulk edit. ``clear_*`` flags force the matching
    column to null; otherwise omit the field to leave it untouched on
    every selected story."""
    status: str | None = Field(default=None, max_length=30)
    priority: str | None = Field(default=None, max_length=30)
    epic_id: str | None = Field(default=None, description="Target epic ID")
    clear_epic: bool = Field(default=False, description="Force-clear the epic")
    assigned_to: str | None = Field(default=None, description="Target user ID")
    unassign: bool = Field(default=False, description="Force-clear the assignee")
    # Allowed values are validated by the service against the
    # Fibonacci scale {0, 1, 2, 3, 5, 8, 13}. The schema only enforces
    # the bare type so route-level errors are 422 for non-int input.
    story_points: int | None = Field(default=None, description="Target story points (Fibonacci 0–13)")
    clear_story_points: bool = Field(default=False, description="Force-clear story points")


@router.get(
    "",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List user stories",
)
async def list_user_stories(
    epic_id: str | None = Query(default=None, description="Filter by epic ID"),
    project_id: str | None = Query(default=None, description="Filter by project ID"),
    priority: str | None = Query(default=None, description="Filter by priority"),
    user_story_status: str | None = Query(default=None, alias="status", description="Filter by status"),
    search: str | None = Query(default=None, description="Search by title"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=10000),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List user stories with optional filtering."""
    service = UserStoryService(db)
    filters = build_filters(
        epic_id=epic_id,
        project_id=project_id,
        priority=priority,
        status=user_story_status,
        search=search,
    )
    result = await service.list_user_stories(
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        filters=filters if filters else None,
    )
    return success_response(data=result, message="User stories retrieved successfully")


@router.post(
    "",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Create user story",
)
async def create_user_story(
    story_data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new user story."""
    service = UserStoryService(db)
    story_data["created_by"] = current_user["id"]
    story = await service.create_user_story(data=story_data)
    return success_response(data=story, message="User story created successfully")


@router.get(
    "/{story_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get user story by ID",
)
async def get_user_story(
    story_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get a specific user story."""
    service = UserStoryService(db)
    story = await service.get_user_story(story_id=story_id)
    return success_response(data=story, message="User story retrieved successfully")


@router.put(
    "/{story_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Update user story",
)
async def update_user_story(
    story_id: str,
    story_data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update an existing user story."""
    service = UserStoryService(db)
    story = await service.update_user_story(story_id=story_id, data=story_data)
    return success_response(data=story, message="User story updated successfully")


@router.delete(
    "/{story_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Delete user story",
)
async def delete_user_story(
    story_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Soft delete a user story."""
    service = UserStoryService(db)
    await service.delete_user_story(story_id=story_id)
    return success_response(message="User story deleted successfully")


# ── Bulk operations ────────────────────────────────────────────────────────


@router.post(
    "/bulk-delete",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Soft-delete multiple user stories",
)
async def bulk_delete_user_stories(
    payload: _BulkIds = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    service = UserStoryService(db)
    result = await service.bulk_delete(payload.ids)
    return success_response(
        data=result,
        message=f"{len(result['succeeded'])} user story(ies) deleted",
    )


@router.post(
    "/bulk-update",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Bulk-update plain fields (status, priority, epic, assignee)",
)
async def bulk_update_user_stories(
    payload: _BulkUpdate = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    has_change = (
        payload.status is not None
        or payload.priority is not None
        or payload.epic_id is not None
        or payload.clear_epic
        or payload.assigned_to is not None
        or payload.unassign
        or payload.story_points is not None
        or payload.clear_story_points
    )
    if not has_change:
        raise ValidationError(
            "At least one editable field must be provided"
        )
    service = UserStoryService(db)
    result = await service.bulk_update(
        payload.ids,
        status=payload.status,
        priority=payload.priority,
        epic_id=payload.epic_id,
        clear_epic=payload.clear_epic,
        assigned_to=payload.assigned_to,
        unassign=payload.unassign,
        story_points=payload.story_points,
        clear_story_points=payload.clear_story_points,
    )
    return success_response(
        data=result,
        message=f"{len(result['succeeded'])} user story(ies) updated",
    )
