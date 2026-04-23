"""Epic management routes."""

from fastapi import APIRouter, Body, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, success_response
from app.services.epic_service import EpicService
from app.utils.helpers import build_filters

router = APIRouter(prefix="/epics", tags=["Epics"])


@router.get(
    "",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List epics",
)
async def list_epics(
    priority: str | None = Query(default=None, description="Filter by priority"),
    project_id: str | None = Query(default=None, description="Filter by project ID"),
    assigned_to: str | None = Query(default=None, description="Filter by assignee"),
    search: str | None = Query(default=None, description="Search by title"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=10000),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List epics with optional filtering."""
    service = EpicService(db)
    filters = build_filters(
        priority=priority,
        project_id=project_id,
        assigned_to=assigned_to,
        search=search,
    )
    result = await service.list_epics(
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        filters=filters if filters else None,
    )
    return success_response(data=result, message="Epics retrieved successfully")


@router.post(
    "",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Create epic",
)
async def create_epic(
    epic_data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new epic."""
    service = EpicService(db)
    epic_data["created_by"] = current_user["id"]
    epic = await service.create_epic(data=epic_data)
    return success_response(data=epic, message="Epic created successfully")


@router.get(
    "/{epic_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get epic by ID",
)
async def get_epic(
    epic_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get a specific epic."""
    service = EpicService(db)
    epic = await service.get_epic(epic_id=epic_id)
    return success_response(data=epic, message="Epic retrieved successfully")


@router.put(
    "/{epic_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Update epic",
)
async def update_epic(
    epic_id: str,
    epic_data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update an existing epic."""
    service = EpicService(db)
    epic = await service.update_epic(epic_id=epic_id, data=epic_data)
    return success_response(data=epic, message="Epic updated successfully")


@router.delete(
    "/{epic_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Delete epic",
)
async def delete_epic(
    epic_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Soft delete an epic."""
    service = EpicService(db)
    await service.delete_epic(epic_id=epic_id)
    return success_response(message="Epic deleted successfully")
