"""Release management routes."""



from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, success_response
from app.services.release_service import ReleaseService

router = APIRouter(prefix="/releases", tags=["Releases"])


@router.get(
    "",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List releases",
)
async def list_releases(
    project_id: str | None = Query(default=None, description="Filter by project ID"),
    release_status: str | None = Query(default=None, description="Filter by status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List releases with optional project and status filters."""
    service = ReleaseService(db)
    result = await service.list_releases(
        project_id=project_id,
        release_status=release_status,
        page=page,
        page_size=page_size,
    )
    return success_response(data=result, message="Releases retrieved successfully")


@router.post(
    "",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Create release",
)
async def create_release(
    release_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new release for a project."""
    service = ReleaseService(db)
    release = await service.create_release(
        release_data=release_data, created_by=current_user["id"]
    )
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
    release_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update an existing release."""
    service = ReleaseService(db)
    release = await service.update_release(
        release_id=release_id, release_data=release_data, updated_by=current_user["id"]
    )
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
    await service.delete_release(release_id=release_id, deleted_by=current_user["id"])
    return success_response(message="Release deleted successfully")


@router.get(
    "/project/{project_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get releases by project",
)
async def get_releases_by_project(
    project_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get all releases for a specific project."""
    service = ReleaseService(db)
    result = await service.list_releases(
        project_id=project_id, page=page, page_size=page_size
    )
    return success_response(data=result, message="Releases retrieved successfully")


@router.post(
    "/{release_id}/transition",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Transition release status",
)
async def transition_release_status(
    release_id: str,
    transition_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Transition a release to a new status (e.g., planned -> in_progress -> released)."""
    service = ReleaseService(db)
    release = await service.transition_status(
        release_id=release_id,
        new_status=transition_data["status"],
        transitioned_by=current_user["id"],
    )
    return success_response(data=release, message="Release status updated successfully")
