"""User story management routes."""

from fastapi import APIRouter, Body, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, success_response
from app.services.user_story_service import UserStoryService
from app.utils.helpers import build_filters

router = APIRouter(prefix="/user-stories", tags=["User Stories"])


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
