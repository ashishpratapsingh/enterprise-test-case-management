"""Report service: CSV and PDF exports for test cases, defects, executions, dashboards."""

from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Any, Sequence

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.services.dashboard_service import DashboardService


# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────

def _csv_stream(rows: list[list[Any]], headers: list[str]) -> io.BytesIO:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(["" if v is None else str(v) for v in row])
    return io.BytesIO(buf.getvalue().encode("utf-8"))


def _pdf_stream(title: str, subtitle: str | None, headers: list[str], rows: list[list[Any]]) -> io.BytesIO:
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=landscape(A4),
        leftMargin=15 * mm,
        rightMargin=15 * mm,
        topMargin=15 * mm,
        bottomMargin=15 * mm,
        title=title,
    )
    styles = getSampleStyleSheet()

    elements: list[Any] = []
    elements.append(Paragraph(f"<b>{title}</b>", styles["Title"]))
    if subtitle:
        elements.append(Paragraph(subtitle, styles["Normal"]))
    elements.append(Paragraph(
        f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
        styles["Normal"],
    ))
    elements.append(Spacer(1, 8 * mm))

    if not rows:
        elements.append(Paragraph("<i>No records found.</i>", styles["Normal"]))
    else:
        table_data: list[list[Any]] = [headers]
        cell_style = styles["BodyText"]
        for row in rows:
            table_data.append([
                Paragraph(str(v) if v is not None else "", cell_style) for v in row
            ])
        t = Table(table_data, repeatRows=1)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a237e")),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("FONTSIZE", (0, 1), (-1, -1), 8),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.whitesmoke, colors.HexColor("#f5f7fb")]),
            ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c7cdd6")),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(t)

    doc.build(elements)
    buf.seek(0)
    return buf


def _fmt_dt(dt: datetime | None) -> str:
    return dt.strftime("%Y-%m-%d %H:%M") if dt else ""


# ──────────────────────────────────────────────────────────────────────────────
# Service
# ──────────────────────────────────────────────────────────────────────────────

class ReportService:
    """Generates downloadable CSV / PDF reports."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.dashboard = DashboardService(session)

    # Test cases ───────────────────────────────────────────────────────────
    async def _load_test_cases(self, project_id: str | None) -> Sequence[Any]:
        from app.models.test_case import TestCase

        stmt = (
            select(TestCase)
            .options(
                selectinload(TestCase.project),
                selectinload(TestCase.module),
                selectinload(TestCase.assignee),
                selectinload(TestCase.creator),
            )
            .where(TestCase.is_deleted == False)  # noqa: E712
            .order_by(TestCase.created_at.desc())
        )
        if project_id:
            stmt = stmt.where(TestCase.project_id == project_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def test_cases_csv(self, project_id: str | None) -> io.BytesIO:
        headers = [
            "Test Case ID", "Title", "Project", "Module", "Type",
            "Priority", "Automation Status", "Status", "Assignee",
            "Created By", "Created At",
        ]
        rows: list[list[Any]] = []
        for tc in await self._load_test_cases(project_id):
            rows.append([
                tc.test_case_id,
                tc.title,
                tc.project.name if tc.project else "",
                tc.module.name if tc.module else "",
                tc.type,
                tc.priority,
                tc.automation_status,
                tc.status,
                tc.assignee.full_name if tc.assignee else "",
                tc.creator.full_name if tc.creator else "",
                _fmt_dt(tc.created_at),
            ])
        return _csv_stream(rows, headers)

    async def test_cases_pdf(self, project_id: str | None) -> io.BytesIO:
        headers = ["TC ID", "Title", "Project", "Type", "Priority", "Automation", "Status", "Assignee"]
        rows: list[list[Any]] = []
        for tc in await self._load_test_cases(project_id):
            rows.append([
                tc.test_case_id,
                tc.title,
                tc.project.name if tc.project else "",
                tc.type,
                tc.priority,
                tc.automation_status,
                tc.status,
                tc.assignee.full_name if tc.assignee else "",
            ])
        subtitle = f"Scope: {'Project ' + project_id if project_id else 'All Projects'} · {len(rows)} test case(s)"
        return _pdf_stream("Test Cases Report", subtitle, headers, rows)

    # Defects ──────────────────────────────────────────────────────────────
    async def _load_defects(self, project_id: str | None) -> Sequence[Any]:
        from app.models.defect import Defect

        stmt = (
            select(Defect)
            .options(
                selectinload(Defect.project),
                selectinload(Defect.reporter),
                selectinload(Defect.assignee),
                selectinload(Defect.test_case),
            )
            .where(Defect.is_deleted == False)  # noqa: E712
            .order_by(Defect.created_at.desc())
        )
        if project_id:
            stmt = stmt.where(Defect.project_id == project_id)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def defects_csv(self, project_id: str | None) -> io.BytesIO:
        headers = [
            "Bug ID", "Title", "Project", "Severity", "Priority", "Status",
            "Reporter", "Assignee", "Linked Test Case", "Step", "Jira", "Created At",
        ]
        rows: list[list[Any]] = []
        for d in await self._load_defects(project_id):
            rows.append([
                d.defect_id,
                d.title,
                d.project.name if d.project else "",
                d.severity,
                d.priority,
                d.status,
                d.reporter.full_name if d.reporter else "",
                d.assignee.full_name if d.assignee else "",
                d.test_case.test_case_id if d.test_case else "",
                d.step_number or "",
                d.jira_ticket_id or "",
                _fmt_dt(d.created_at),
            ])
        return _csv_stream(rows, headers)

    async def defects_pdf(self, project_id: str | None) -> io.BytesIO:
        headers = ["Bug ID", "Title", "Project", "Severity", "Priority", "Status", "Assignee", "Jira"]
        rows: list[list[Any]] = []
        for d in await self._load_defects(project_id):
            rows.append([
                d.defect_id,
                d.title,
                d.project.name if d.project else "",
                d.severity,
                d.priority,
                d.status,
                d.assignee.full_name if d.assignee else "",
                d.jira_ticket_id or "",
            ])
        subtitle = f"Scope: {'Project ' + project_id if project_id else 'All Projects'} · {len(rows)} bug(s)"
        return _pdf_stream("Defects Report", subtitle, headers, rows)

    # Test-run results ─────────────────────────────────────────────────────
    async def _load_run_results(self, test_run_id: str) -> tuple[Any | None, list[Any]]:
        from app.models.test_execution import TestExecution
        from app.models.test_run import TestRun

        run = (
            await self.session.execute(
                select(TestRun)
                .options(
                    selectinload(TestRun.test_suite),
                    selectinload(TestRun.assignee),
                    selectinload(TestRun.creator),
                )
                .where(TestRun.id == test_run_id)
            )
        ).scalar_one_or_none()

        execs = (
            await self.session.execute(
                select(TestExecution)
                .options(
                    selectinload(TestExecution.test_case),
                    selectinload(TestExecution.executor),
                )
                .where(TestExecution.test_run_id == test_run_id)
            )
        ).scalars().all()

        return run, list(execs)

    async def test_run_results_csv(self, test_run_id: str) -> io.BytesIO:
        run, execs = await self._load_run_results(test_run_id)
        headers = [
            "Test Case ID", "Title", "Status", "Executed By",
            "Executed At", "Duration (s)", "Notes",
        ]
        rows: list[list[Any]] = []
        for e in execs:
            tc = e.test_case
            rows.append([
                tc.test_case_id if tc else "",
                tc.title if tc else "",
                e.status,
                e.executor.full_name if e.executor else "",
                _fmt_dt(e.executed_at),
                e.execution_time_seconds or "",
                (e.notes or "").replace("\n", " ")[:500],
            ])
        return _csv_stream(rows, headers)

    async def test_run_results_pdf(self, test_run_id: str) -> io.BytesIO:
        run, execs = await self._load_run_results(test_run_id)
        headers = ["TC ID", "Title", "Status", "Executed By", "Executed At"]
        rows: list[list[Any]] = []
        for e in execs:
            tc = e.test_case
            rows.append([
                tc.test_case_id if tc else "",
                tc.title if tc else "",
                e.status,
                e.executor.full_name if e.executor else "",
                _fmt_dt(e.executed_at),
            ])
        if run:
            subtitle = (
                f"Run: <b>{run.name}</b> · Status: {run.status} · "
                f"Environment: {run.environment or '—'} · {len(rows)} test case(s)"
            )
            title = f"Test Run Results — {run.name}"
        else:
            subtitle = "Run not found"
            title = "Test Run Results"
        return _pdf_stream(title, subtitle, headers, rows)

    # Dashboard ────────────────────────────────────────────────────────────
    async def _load_projects(self, project_id: str | None) -> list[Any]:
        from app.models.project import Project

        stmt = select(Project).where(Project.is_deleted == False)  # noqa: E712
        if project_id:
            stmt = stmt.where(Project.id == project_id)
        stmt = stmt.order_by(Project.name.asc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def dashboard_pdf(self, project_id: str | None) -> io.BytesIO:
        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, title="Dashboard Summary")
        styles = getSampleStyleSheet()
        elements: list[Any] = []

        projects = await self._load_projects(project_id)

        elements.append(Paragraph("<b>Dashboard Summary</b>", styles["Title"]))
        if project_id:
            scope = f"Project: {projects[0].name}" if projects else f"Project: {project_id}"
        else:
            scope = f"All Projects ({len(projects)})"
        elements.append(Paragraph(scope, styles["Normal"]))
        elements.append(Paragraph(
            f"Generated: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}",
            styles["Normal"],
        ))
        elements.append(Spacer(1, 8 * mm))

        def _kv_block(heading: str, data: dict[str, Any]) -> None:
            elements.append(Paragraph(f"<b>{heading}</b>", styles["Heading3"]))
            rows = [[k.replace("_", " ").title(), str(v)] for k, v in data.items()]
            t = Table(rows, colWidths=[70 * mm, 90 * mm])
            t.setStyle(TableStyle([
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#c7cdd6")),
                ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#f0f2f8")),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ]))
            elements.append(t)
            elements.append(Spacer(1, 5 * mm))

        if not projects:
            elements.append(Paragraph("<i>No projects found.</i>", styles["Normal"]))
        else:
            for idx, project in enumerate(projects):
                if idx > 0:
                    elements.append(PageBreak())
                elements.append(Paragraph(
                    f"<b>{project.code} — {project.name}</b>",
                    styles["Heading1"],
                ))
                elements.append(Spacer(1, 3 * mm))

                coverage = await self.dashboard.test_coverage_by_requirement(project.id)
                pass_fail = await self.dashboard.pass_fail_ratio(project.id)
                automation = await self.dashboard.automation_coverage(project.id)
                defect_density = await self.dashboard.defect_density(project.id)

                _kv_block("Test Coverage by Requirement", coverage)
                _kv_block("Pass / Fail Ratio", pass_fail)
                _kv_block("Automation Coverage", automation)
                _kv_block("Defect Density", defect_density)

        doc.build(elements)
        buf.seek(0)
        return buf
