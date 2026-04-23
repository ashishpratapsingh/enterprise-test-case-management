"""Report export routes (CSV + PDF)."""

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db
from app.services.report_service import ReportService

router = APIRouter(prefix="/reports", tags=["Reports"])


def _csv_response(buf, filename: str) -> StreamingResponse:
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _pdf_response(buf, filename: str) -> StreamingResponse:
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── Test cases ───────────────────────────────────────────────────────────────

@router.get("/test-cases/csv", summary="Export test cases as CSV")
async def export_test_cases_csv(
    project_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    service = ReportService(db)
    buf = await service.test_cases_csv(project_id=project_id)
    return _csv_response(buf, "test-cases.csv")


@router.get("/test-cases/pdf", summary="Export test cases as PDF")
async def export_test_cases_pdf(
    project_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    service = ReportService(db)
    buf = await service.test_cases_pdf(project_id=project_id)
    return _pdf_response(buf, "test-cases.pdf")


# ── Defects ──────────────────────────────────────────────────────────────────

@router.get("/defects/csv", summary="Export defects as CSV")
async def export_defects_csv(
    project_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    service = ReportService(db)
    buf = await service.defects_csv(project_id=project_id)
    return _csv_response(buf, "defects.csv")


@router.get("/defects/pdf", summary="Export defects as PDF")
async def export_defects_pdf(
    project_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    service = ReportService(db)
    buf = await service.defects_pdf(project_id=project_id)
    return _pdf_response(buf, "defects.pdf")


# ── Test-run results ─────────────────────────────────────────────────────────

@router.get("/test-runs/{test_run_id}/csv", summary="Export test run results as CSV")
async def export_test_run_csv(
    test_run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    service = ReportService(db)
    buf = await service.test_run_results_csv(test_run_id=test_run_id)
    return _csv_response(buf, f"test-run-{test_run_id}.csv")


@router.get("/test-runs/{test_run_id}/pdf", summary="Export test run results as PDF")
async def export_test_run_pdf(
    test_run_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    service = ReportService(db)
    buf = await service.test_run_results_pdf(test_run_id=test_run_id)
    return _pdf_response(buf, f"test-run-{test_run_id}.pdf")


# ── Dashboard summary ────────────────────────────────────────────────────────

@router.get("/dashboard/pdf", summary="Export dashboard summary as PDF")
async def export_dashboard_pdf(
    project_id: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> StreamingResponse:
    service = ReportService(db)
    buf = await service.dashboard_pdf(project_id=project_id)
    return _pdf_response(buf, "dashboard-summary.pdf")
