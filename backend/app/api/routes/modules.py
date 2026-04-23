"""Module management routes."""



from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, success_response
from app.schemas.module import ModuleCreate, ModuleResponse, ModuleUpdate
from app.services.module_service import ModuleService

router = APIRouter(prefix="/modules", tags=["Modules"])


@router.get(
    "",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List modules by project",
)
async def list_modules(
    project_id: str = Query(description="Filter modules by project ID"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List all modules for a given project."""
    service = ModuleService(db)
    result = await service.list_modules(
        project_id=project_id, page=page, page_size=page_size
    )
    return success_response(data=result, message="Modules retrieved successfully")


@router.post(
    "",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Create module",
)
async def create_module(
    module_data: ModuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new module within a project."""
    service = ModuleService(db)
    module: ModuleResponse = await service.create_module(
        module_data=module_data, created_by=current_user["id"]
    )
    return success_response(
        data=module.model_dump(mode="json"), message="Module created successfully"
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
    module: ModuleResponse = await service.get_module(module_id=module_id)
    return success_response(
        data=module.model_dump(mode="json"), message="Module retrieved successfully"
    )


@router.put(
    "/{module_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Update module",
)
async def update_module(
    module_id: str,
    module_data: ModuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update an existing module."""
    service = ModuleService(db)
    module: ModuleResponse = await service.update_module(
        module_id=module_id, module_data=module_data, updated_by=current_user["id"]
    )
    return success_response(
        data=module.model_dump(mode="json"), message="Module updated successfully"
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
    await service.delete_module(module_id=module_id, deleted_by=current_user["id"])
    return success_response(message="Module deleted successfully")
