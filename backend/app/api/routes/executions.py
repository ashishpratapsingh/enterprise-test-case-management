"""Test execution routes."""

import os
import uuid

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, success_response
from app.services.defect_service import DefectService
from app.services.execution_service import ExecutionService

router = APIRouter(prefix="/executions", tags=["Executions"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post(
    "",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Create execution",
)
async def create_execution(
    execution_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new test execution record for a test case within a test run."""
    service = ExecutionService(db)
    execution = await service.create_execution(
        execution_data=execution_data, executed_by=current_user["id"]
    )
    return success_response(data=execution, message="Execution created successfully")


@router.put(
    "/{execution_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Update execution with step results",
)
async def update_execution(
    execution_id: str,
    execution_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update an execution with step-level results, status, and optional attachments."""
    service = ExecutionService(db)
    execution = await service.update_execution(
        execution_id=execution_id,
        execution_data=execution_data,
        updated_by=current_user["id"],
    )
    return success_response(data=execution, message="Execution updated successfully")


@router.get(
    "/{execution_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get execution by ID",
)
async def get_execution(
    execution_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get a specific execution with its step results."""
    service = ExecutionService(db)
    execution = await service.get_execution(execution_id=execution_id)
    return success_response(data=execution, message="Execution retrieved successfully")


@router.get(
    "/run/{test_run_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get executions for a test run",
)
async def get_executions_by_run(
    test_run_id: str,
    test_case_id: str | None = Query(default=None, description="Filter by test case"),
    execution_status: str | None = Query(default=None, alias="status", description="Filter by status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get all executions for a specific test run."""
    service = ExecutionService(db)
    result = await service.get_executions_by_run(
        test_run_id=test_run_id,
        test_case_id=test_case_id,
        status=execution_status,
        page=page,
        page_size=page_size,
    )
    return success_response(data=result, message="Executions retrieved successfully")


@router.post(
    "/{execution_id}/upload",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Upload screenshot/video for an execution step",
)
async def upload_execution_attachment(
    execution_id: str,
    step_number: int = Query(..., description="Step number this attachment belongs to"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Upload a screenshot or video file for a specific execution step."""
    service = ExecutionService(db)
    # Verify execution exists
    await service.get_execution(execution_id=execution_id)

    # Save file
    ext = os.path.splitext(file.filename or "file")[1]
    unique_name = f"{execution_id}_{step_number}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    file_url = f"/uploads/{unique_name}"
    return success_response(
        data={"url": file_url, "filename": file.filename, "size": len(contents)},
        message="File uploaded successfully",
    )


@router.get(
    "/{execution_id}/defects",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List defects attached to this execution",
)
async def list_execution_defects(
    execution_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List all defects attached to an execution (flat, ordered by step_number)."""
    exec_service = ExecutionService(db)
    await exec_service.get_execution(execution_id=execution_id)

    defect_service = DefectService(db)
    defects = await defect_service.list_by_execution(execution_id=execution_id)
    return success_response(data=defects, message="Defects retrieved successfully")


@router.post(
    "/{execution_id}/steps/{step_number}/defects",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Attach a bug to an execution step (create new or link existing)",
)
async def attach_step_defect(
    execution_id: str,
    step_number: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Attach a bug to a specific step of this execution.

    If `payload` contains `defect_id` (UUID of an existing defect), that defect
    is re-scoped to this execution+step. Otherwise a new defect is created with
    fields taken from `payload` (title, description, severity, priority, project_id).
    The reporter and the test_case_id are inferred from the current user and the
    execution.
    """
    exec_service = ExecutionService(db)
    execution = await exec_service.get_execution(execution_id=execution_id)

    data = dict(payload)
    if "defect_id" not in data:
        data.setdefault("reported_by", current_user["id"])
        data.setdefault("test_case_id", execution.test_case_id)

    defect_service = DefectService(db)
    defect = await defect_service.attach_to_step(
        execution_id=execution_id,
        step_number=step_number,
        data=data,
    )
    # Return serialized form so frontend gets consistent shape
    defects = await defect_service.list_by_execution(execution_id=execution_id)
    created = next(
        (d for d in defects if d.get("id") == getattr(defect, "id", None)),
        None,
    )
    return success_response(
        data=created or {"id": getattr(defect, "id", None)},
        message="Bug attached to step successfully",
    )


@router.delete(
    "/{execution_id}/steps/{step_number}/defects/{defect_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Unlink a bug from an execution step",
)
async def detach_step_defect(
    execution_id: str,
    step_number: int,
    defect_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Unlink a defect from this execution step. The defect itself is preserved."""
    defect_service = DefectService(db)
    await defect_service.detach_from_step(defect_id=defect_id)
    return success_response(message="Bug unlinked from step")
