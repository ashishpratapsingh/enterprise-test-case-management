"""Requirement management routes."""

from fastapi import APIRouter, Body, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, success_response
from app.services.requirement_service import RequirementService
from app.utils.helpers import build_filters

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
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List requirements with optional project filter and search."""
    service = RequirementService(db)
    filters = build_filters(project_id=project_id, search=search)
    result = await service.list_requirements(
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        filters=filters or None,
    )
    return success_response(data=result, message="Requirements retrieved successfully")


@router.post(
    "",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Create requirement",
)
async def create_requirement(
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new requirement."""
    # Requirement model has no ``created_by`` column — leave the
    # payload alone. ``current_user`` is consumed only for the auth
    # check.
    service = RequirementService(db)
    requirement = await service.create_requirement(data=payload)
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
    payload: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update an existing requirement."""
    service = RequirementService(db)
    requirement = await service.update_requirement(
        requirement_id=requirement_id, data=payload
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
    await service.delete_requirement(requirement_id=requirement_id)
    return success_response(message="Requirement deleted successfully")


@router.get(
    "/project/{project_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get requirements by project",
)
async def get_requirements_by_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get all requirements for a specific project."""
    service = RequirementService(db)
    items = await service.list_requirements_by_project(project_id=project_id)
    return success_response(data=items, message="Requirements retrieved successfully")


@router.post(
    "/{requirement_id}/link-jira",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Link requirement to a JIRA issue (or any external tracker)",
)
async def link_to_jira(
    requirement_id: str,
    jira_data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Link a requirement to an external tracker key (e.g. a JIRA
    issue key) for traceability."""
    external_id = jira_data.get("jira_issue_key") or jira_data.get("external_id")
    if not external_id:
        from app.core.exceptions import ValidationError
        raise ValidationError(
            "Provide either 'jira_issue_key' or 'external_id' in the body"
        )
    service = RequirementService(db)
    result = await service.link_external_id(
        requirement_id=requirement_id, external_id=external_id
    )
    return success_response(data=result, message="Requirement linked successfully")
