"""Test run management routes."""

from fastapi import APIRouter, Body, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, success_response
from app.services.execution_service import ExecutionService
from app.services.test_run_service import TestRunService
from app.utils.helpers import build_filters

router = APIRouter(prefix="/testruns", tags=["Test Runs"])


@router.get(
    "",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List test runs",
)
async def list_test_runs(
    project_id: str | None = Query(default=None, description="Filter by project ID"),
    release_id: str | None = Query(default=None, description="Filter by release ID"),
    run_status: str | None = Query(default=None, alias="status", description="Filter by status"),
    test_suite_id: str | None = Query(default=None, description="Filter by test suite ID"),
    search: str | None = Query(default=None, description="Search by name"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    sort_by: str = Query(default="created_at"),
    sort_order: str = Query(default="desc"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List test runs with optional filtering."""
    service = TestRunService(db)
    filters = build_filters(
        project_id=project_id,
        release_id=release_id,
        status=run_status,
        test_suite_id=test_suite_id,
        search=search,
    )

    result = await service.list_test_runs(
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order,
        filters=filters if filters else None,
    )
    return success_response(data=result, message="Test runs retrieved successfully")


@router.post(
    "",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Create test run",
)
async def create_test_run(
    run_data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new test run, optionally linking it to a test suite and release."""
    service = TestRunService(db)
    run_data["created_by"] = current_user["id"]
    run = await service.create_test_run(data=run_data)
    return success_response(data=run, message="Test run created successfully")


@router.get(
    "/{run_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get test run by ID",
)
async def get_test_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get a specific test run with execution summary."""
    service = TestRunService(db)
    run = await service.get_test_run(run_id=run_id)
    return success_response(data=run, message="Test run retrieved successfully")


@router.put(
    "/{run_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Update test run",
)
async def update_test_run(
    run_id: str,
    run_data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update an existing test run."""
    service = TestRunService(db)
    run = await service.update_test_run(run_id=run_id, data=run_data)
    return success_response(data=run, message="Test run updated successfully")


@router.delete(
    "/{run_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Delete test run",
)
async def delete_test_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Soft delete a test run."""
    service = TestRunService(db)
    await service.delete_test_run(run_id=run_id)
    return success_response(message="Test run deleted successfully")


@router.post(
    "/{run_id}/start",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Start test run",
)
async def start_test_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Transition a test run to 'In Progress' status."""
    service = TestRunService(db)
    run = await service.transition_status(run_id=run_id, new_status="In Progress")
    return success_response(data=run, message="Test run started")


@router.post(
    "/{run_id}/complete",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Complete test run",
)
async def complete_test_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Transition a test run to 'Completed' status."""
    service = TestRunService(db)
    run = await service.transition_status(run_id=run_id, new_status="Completed")
    return success_response(data=run, message="Test run completed")


@router.post(
    "/{run_id}/abort",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Abort test run",
)
async def abort_test_run(
    run_id: str,
    body: dict = Body(default={}),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Transition a test run to 'Cancelled' status with an optional abort reason."""
    service = TestRunService(db)
    abort_reason = body.get("abort_reason") or None
    run = await service.transition_status(run_id=run_id, new_status="Cancelled", abort_reason=abort_reason)
    return success_response(data=run, message="Test run aborted")


@router.post(
    "/{run_id}/block",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Block test run",
)
async def block_test_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Transition a test run to 'Blocked' status."""
    service = TestRunService(db)
    run = await service.transition_status(run_id=run_id, new_status="Blocked")
    return success_response(data=run, message="Test run blocked")


@router.get(
    "/{run_id}/executions",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get executions for a test run",
)
async def get_run_executions(
    run_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get all executions for a specific test run (convenience alias)."""
    exec_service = ExecutionService(db)
    result = await exec_service.get_executions_by_run(
        test_run_id=run_id, page=page, page_size=page_size
    )
    return success_response(data=result, message="Executions retrieved successfully")
