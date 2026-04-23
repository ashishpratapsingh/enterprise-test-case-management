"""Project management routes."""



from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    RoleChecker,
    get_current_user,
    get_db,
    success_response,
)
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.project_service import ProjectService
from app.utils.helpers import build_filters

router = APIRouter(prefix="/projects", tags=["Projects"])


@router.get(
    "",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List projects",
)
async def list_projects(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=10000),
    search: str | None = Query(default=None, description="Search by name, code or description"),
    category: str | None = Query(default=None, description="Filter by category"),
    is_active: bool | None = Query(default=None),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List all projects with pagination and filtering."""
    service = ProjectService(db)
    filters = build_filters(
        search=search,
        category=category,
        is_active=is_active,
    )
    result = await service.list_projects(
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        filters=filters if filters else None,
    )
    return success_response(data=result, message="Projects retrieved successfully")


@router.post(
    "",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Create project",
)
async def create_project(
    project_data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(
        RoleChecker(allowed_roles=["admin", "qa_head"])
    ),
) -> dict:
    """Create a new project. Restricted to admin and QA head roles."""
    service = ProjectService(db)
    project = await service.create_project(
        data=project_data.model_dump(), created_by=current_user["id"]
    )
    return success_response(data=project, message="Project created successfully")


@router.get(
    "/{project_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get project with modules",
)
async def get_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get a specific project by UUID, including its modules."""
    service = ProjectService(db)
    project = await service.get_project_with_modules(project_id=project_id)
    return success_response(data=project, message="Project retrieved successfully")


@router.put(
    "/{project_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Update project",
)
async def update_project(
    project_id: str,
    project_data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update an existing project."""
    service = ProjectService(db)
    project = await service.update_project(
        project_id=project_id, data=project_data.model_dump(exclude_unset=True)
    )
    return success_response(data=project, message="Project updated successfully")


@router.delete(
    "/{project_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Soft delete project",
)
async def delete_project(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Soft delete a project."""
    service = ProjectService(db)
    await service.delete_project(project_id=project_id)
    return success_response(message="Project deleted successfully")
