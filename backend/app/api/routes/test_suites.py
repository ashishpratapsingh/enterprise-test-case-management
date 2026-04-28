"""Test suite management routes."""

from fastapi import APIRouter, Body, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, success_response
from app.services.test_suite_service import TestSuiteService
from app.utils.helpers import build_filters

router = APIRouter(prefix="/testsuites", tags=["Test Suites"])


# ── Bulk operation schemas ─────────────────────────────────────────────────


class _BulkIds(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500, description="Test suite IDs")


class _BulkSetActive(_BulkIds):
    is_active: bool = Field(description="True to activate, false to deactivate")


@router.get(
    "",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List test suites",
)
async def list_test_suites(
    project_id: str | None = Query(default=None, description="Filter by project ID"),
    is_active: bool | None = Query(default=None, description="Filter by active status"),
    search: str | None = Query(default=None, description="Search by name"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List test suites with optional filtering."""
    service = TestSuiteService(db)
    filters = build_filters(
        project_id=project_id,
        is_active=is_active,
        search=search,
    )
    result = await service.list_suites(
        page=page, page_size=page_size, filters=filters if filters else None
    )
    return success_response(data=result, message="Test suites retrieved successfully")


@router.post(
    "",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Create test suite",
)
async def create_test_suite(
    suite_data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new test suite."""
    service = TestSuiteService(db)
    suite_data["created_by"] = current_user["id"]
    suite = await service.create_suite(data=suite_data)
    return success_response(data=suite, message="Test suite created successfully")


@router.get(
    "/{suite_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get test suite by ID",
)
async def get_test_suite(
    suite_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get a specific test suite with its test cases."""
    service = TestSuiteService(db)
    suite = await service.get_suite_with_cases(suite_id=suite_id)
    return success_response(data=suite, message="Test suite retrieved successfully")


@router.put(
    "/{suite_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Update test suite",
)
async def update_test_suite(
    suite_id: str,
    suite_data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update an existing test suite."""
    service = TestSuiteService(db)
    suite = await service.update_suite(suite_id=suite_id, data=suite_data)
    return success_response(data=suite, message="Test suite updated successfully")


@router.delete(
    "/{suite_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Delete test suite",
)
async def delete_test_suite(
    suite_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Soft delete a test suite."""
    service = TestSuiteService(db)
    await service.delete_suite(suite_id=suite_id)
    return success_response(message="Test suite deleted successfully")


@router.post(
    "/{suite_id}/cases",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Add test cases to suite",
)
async def add_test_cases_to_suite(
    suite_id: str,
    case_data: dict = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Add test cases to a test suite.

    Expected case_data: {"test_case_ids": ["<uuid>", ...]}
    """
    service = TestSuiteService(db)
    test_case_ids = case_data.get("test_case_ids", [])
    for tc_id in test_case_ids:
        await service.add_test_case(suite_id=suite_id, test_case_id=tc_id)
    suite = await service.get_suite_with_cases(suite_id=suite_id)
    return success_response(data=suite, message="Test cases added to suite successfully")


@router.delete(
    "/{suite_id}/cases/{case_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Remove test case from suite",
)
async def remove_test_case_from_suite(
    suite_id: str,
    case_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Remove a test case from a test suite."""
    service = TestSuiteService(db)
    await service.remove_test_case(suite_id=suite_id, test_case_id=case_id)
    return success_response(message="Test case removed from suite successfully")


# ── Bulk operations ────────────────────────────────────────────────────────


@router.post(
    "/bulk-delete",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Soft-delete multiple test suites",
)
async def bulk_delete_test_suites(
    payload: _BulkIds = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    service = TestSuiteService(db)
    result = await service.bulk_delete(payload.ids)
    return success_response(
        data=result,
        message=f"{len(result['succeeded'])} suite(s) deleted",
    )


@router.post(
    "/bulk-set-active",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Activate or deactivate multiple test suites",
)
async def bulk_set_active_test_suites(
    payload: _BulkSetActive = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    service = TestSuiteService(db)
    result = await service.bulk_set_active(payload.ids, payload.is_active)
    label = "activated" if payload.is_active else "deactivated"
    return success_response(
        data=result,
        message=f"{len(result['succeeded'])} suite(s) {label}",
    )
