"""Module management routes."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, success_response
from app.schemas.module import ModuleCreate, ModuleResponse, ModuleUpdate
from app.services.module_service import ModuleService

router = APIRouter(prefix="/modules", tags=["Modules"])


def _serialize(module) -> dict:
    """SQLAlchemy row → API response dict, via the Pydantic schema so
    field validation runs on the way out."""
    return ModuleResponse.model_validate(module).model_dump(mode="json")


@router.get(
    "",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List modules by project",
)
async def list_modules(
    project_id: str = Query(description="Filter modules by project ID"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List all modules for a given project."""
    service = ModuleService(db)
    modules = await service.list_modules_by_project(project_id=project_id)
    return success_response(
        data=[_serialize(m) for m in modules],
        message="Modules retrieved successfully",
    )


@router.post(
    "",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Create module",
)
async def create_module(
    payload: ModuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new module within a project."""
    data = payload.model_dump(mode="json")
    project_id = data.pop("project_id")
    service = ModuleService(db)
    module = await service.create_module(project_id=project_id, data=data)
    return success_response(
        data=_serialize(module), message="Module created successfully"
    )


@router.get(
    "/{module_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get module by ID",
)
async def get_module(
    module_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get a specific module by its UUID."""
    service = ModuleService(db)
    module = await service.get_module(module_id=module_id)
    return success_response(
        data=_serialize(module), message="Module retrieved successfully"
    )


@router.put(
    "/{module_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Update module",
)
async def update_module(
    module_id: str,
    payload: ModuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update an existing module."""
    service = ModuleService(db)
    module = await service.update_module(
        module_id=module_id,
        data=payload.model_dump(mode="json", exclude_unset=True),
    )
    return success_response(
        data=_serialize(module), message="Module updated successfully"
    )


@router.delete(
    "/{module_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Soft delete module",
)
async def delete_module(
    module_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Soft delete a module."""
    service = ModuleService(db)
    await service.delete_module(module_id=module_id)
    return success_response(message="Module deleted successfully")
