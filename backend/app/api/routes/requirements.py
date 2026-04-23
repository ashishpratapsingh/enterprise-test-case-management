"""Requirement management routes."""



from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, success_response
from app.services.requirement_service import RequirementService

router = APIRouter(prefix="/requirements", tags=["Requirements"])


@router.get(
    "",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List requirements",
)
async def list_requirements(
    project_id: str | None = Query(default=None, description="Filter by project ID"),
    search: str | None = Query(default=None, description="Search by title or description"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List requirements with optional project filter and search."""
    service = RequirementService(db)
    result = await service.list_requirements(
        project_id=project_id, search=search, page=page, page_size=page_size
    )
    return success_response(data=result, message="Requirements retrieved successfully")


@router.post(
    "",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Create requirement",
)
async def create_requirement(
    requirement_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new requirement."""
    service = RequirementService(db)
    requirement = await service.create_requirement(
        requirement_data=requirement_data, created_by=current_user["id"]
    )
    return success_response(data=requirement, message="Requirement created successfully")


@router.get(
    "/{requirement_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get requirement by ID",
)
async def get_requirement(
    requirement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get a specific requirement by UUID."""
    service = RequirementService(db)
    requirement = await service.get_requirement(requirement_id=requirement_id)
    return success_response(data=requirement, message="Requirement retrieved successfully")


@router.put(
    "/{requirement_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Update requirement",
)
async def update_requirement(
    requirement_id: str,
    requirement_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update an existing requirement."""
    service = RequirementService(db)
    requirement = await service.update_requirement(
        requirement_id=requirement_id,
        requirement_data=requirement_data,
        updated_by=current_user["id"],
    )
    return success_response(data=requirement, message="Requirement updated successfully")


@router.delete(
    "/{requirement_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Soft delete requirement",
)
async def delete_requirement(
    requirement_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Soft delete a requirement."""
    service = RequirementService(db)
    await service.delete_requirement(
        requirement_id=requirement_id, deleted_by=current_user["id"]
    )
    return success_response(message="Requirement deleted successfully")


@router.get(
    "/project/{project_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get requirements by project",
)
async def get_requirements_by_project(
    project_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get all requirements for a specific project."""
    service = RequirementService(db)
    result = await service.list_requirements(
        project_id=project_id, page=page, page_size=page_size
    )
    return success_response(data=result, message="Requirements retrieved successfully")


@router.post(
    "/{requirement_id}/link-jira",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Link requirement to JIRA issue",
)
async def link_to_jira(
    requirement_id: str,
    jira_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Link a requirement to a JIRA issue for traceability."""
    service = RequirementService(db)
    result = await service.link_to_jira(
        requirement_id=requirement_id,
        jira_issue_key=jira_data["jira_issue_key"],
        linked_by=current_user["id"],
    )
    return success_response(data=result, message="Requirement linked to JIRA successfully")
