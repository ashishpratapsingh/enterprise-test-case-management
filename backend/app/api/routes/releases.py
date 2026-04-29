"""Release management routes."""

from fastapi import APIRouter, Body, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, success_response
from app.services.release_service import ReleaseService
from app.utils.helpers import build_filters

router = APIRouter(prefix="/releases", tags=["Releases"])


@router.get(
    "",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List releases",
)
async def list_releases(
    project_id: str | None = Query(default=None, description="Filter by project ID"),
    release_status: str | None = Query(
        default=None, alias="status", description="Filter by status"
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List releases with optional project and status filters."""
    service = ReleaseService(db)
    filters = build_filters(project_id=project_id, status=release_status)
    result = await service.list_releases(
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        filters=filters or None,
    )
    return success_response(data=result, message="Releases retrieved successfully")


@router.post(
    "",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Create release",
)
async def create_release(
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new release for a project."""
    # Release model has no ``created_by`` column — leave the payload
    # alone. ``current_user`` is consumed only for the auth check.
    service = ReleaseService(db)
    release = await service.create_release(data=payload)
    return success_response(data=release, message="Release created successfully")


@router.get(
    "/{release_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get release by ID",
)
async def get_release(
    release_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get a specific release by UUID."""
    service = ReleaseService(db)
    release = await service.get_release(release_id=release_id)
    return success_response(data=release, message="Release retrieved successfully")


@router.put(
    "/{release_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Update release",
)
async def update_release(
    release_id: str,
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update an existing release."""
    service = ReleaseService(db)
    release = await service.update_release(release_id=release_id, data=payload)
    return success_response(data=release, message="Release updated successfully")


@router.delete(
    "/{release_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Soft delete release",
)
async def delete_release(
    release_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Soft delete a release."""
    service = ReleaseService(db)
    await service.delete_release(release_id=release_id)
    return success_response(message="Release deleted successfully")


@router.get(
    "/project/{project_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get releases by project",
)
async def get_releases_by_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get all releases for a specific project."""
    service = ReleaseService(db)
    items = await service.list_releases_by_project(project_id=project_id)
    return success_response(data=items, message="Releases retrieved successfully")


@router.post(
    "/{release_id}/transition",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Transition release status",
)
async def transition_release_status(
    release_id: str,
    transition_data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Transition a release to a new status (e.g., Planned → In Progress → Released)."""
    service = ReleaseService(db)
    release = await service.transition_status(
        release_id=release_id, new_status=transition_data["status"]
    )
    return success_response(data=release, message="Release status updated successfully")
