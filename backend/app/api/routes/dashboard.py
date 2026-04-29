"""Dashboard analytics routes."""



from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, success_response
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get(
    "/coverage",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Test coverage by requirement",
)
async def get_test_coverage(
    project_id: str = Query(description="Project ID"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get test coverage metrics grouped by requirement."""
    service = DashboardService(db)
    result = await service.test_coverage_by_requirement(project_id=project_id)
    return success_response(data=result, message="Test coverage retrieved successfully")


@router.get(
    "/pass-fail-ratio",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Pass/fail ratio",
)
async def get_pass_fail_ratio(
    project_id: str = Query(description="Project ID"),
    release_id: str | None = Query(default=None, description="Optional release filter"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get the pass/fail ratio for test executions."""
    # release_id is accepted for backwards compat but not yet used by
    # the service — wiring it in needs a join through TestRun. Logged
    # as a known gap; not blocking the rest of the dashboard.
    _ = release_id  # noqa: F841 — intentional, see comment above
    service = DashboardService(db)
    result = await service.pass_fail_ratio(project_id=project_id)
    return success_response(data=result, message="Pass/fail ratio retrieved successfully")


@router.get(
    "/automation-coverage",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Automation coverage percentage",
)
async def get_automation_coverage(
    project_id: str = Query(description="Project ID"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get the percentage of test cases that are automated vs manual."""
    service = DashboardService(db)
    result = await service.automation_coverage(project_id=project_id)
    return success_response(data=result, message="Automation coverage retrieved successfully")


@router.get(
    "/execution-trend",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Execution trend over time",
)
async def get_execution_trend(
    project_id: str = Query(description="Project ID"),
    days: int = Query(default=30, ge=7, le=365, description="Number of days to look back"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get test execution trends over a specified time period."""
    service = DashboardService(db)
    result = await service.execution_trend(project_id=project_id, days=days)
    return success_response(data=result, message="Execution trend retrieved successfully")


@router.get(
    "/defect-density",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Defect density",
)
async def get_defect_density(
    project_id: str = Query(description="Project ID"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get defect density metrics (defects per module/requirement)."""
    service = DashboardService(db)
    result = await service.defect_density(project_id=project_id)
    return success_response(data=result, message="Defect density retrieved successfully")


@router.get(
    "/release-readiness/{release_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Release readiness score",
)
async def get_release_readiness(
    release_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Calculate and return a release readiness score based on test execution results,
    defect status, and requirement coverage."""
    service = DashboardService(db)
    result = await service.release_readiness_score(release_id=release_id)
    return success_response(data=result, message="Release readiness retrieved successfully")
