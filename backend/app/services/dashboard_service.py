"""Dashboard service: aggregated metrics and analytics."""

import uuid
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession


class DashboardService:
    """Computes dashboard metrics from test management data."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def test_coverage_by_requirement(
        self,
        project_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Calculate the percentage of requirements covered by test cases.

        Returns:
            Dict with total_requirements, covered_requirements, and coverage_percentage.
        """
        from app.models.requirement import Requirement
        from app.models.test_case import TestCase

        # Total non-deleted requirements for the project
        total_stmt = (
            select(func.count(Requirement.id))
            .where(Requirement.project_id == project_id)
            .where(Requirement.is_deleted == False)  # noqa: E712
        )
        total_result = await self.session.execute(total_stmt)
        total_requirements = total_result.scalar_one()

        # Requirements that have at least one linked test case
        covered_stmt = (
            select(func.count(func.distinct(TestCase.requirement_id)))
            .where(TestCase.project_id == project_id)
            .where(TestCase.is_deleted == False)  # noqa: E712
            .where(TestCase.requirement_id.isnot(None))
        )
        covered_result = await self.session.execute(covered_stmt)
        covered_requirements = covered_result.scalar_one()

        coverage_pct = (
            (covered_requirements / total_requirements * 100)
            if total_requirements > 0
            else 0.0
        )

        return {
            "total_requirements": total_requirements,
            "covered_requirements": covered_requirements,
            "coverage_percentage": round(coverage_pct, 2),
        }

    async def pass_fail_ratio(
        self,
        project_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Calculate the pass/fail ratio for executions in a project.

        Returns:
            Dict with total_executions, passed, failed, blocked, not_executed,
            and pass_rate.
        """
        from app.models.test_execution import TestExecution as Execution
        from app.models.test_case import TestCase

        base_stmt = (
            select(
                Execution.status,
                func.count(Execution.id).label("count"),
            )
            .join(TestCase, TestCase.id == Execution.test_case_id)
            .where(TestCase.project_id == project_id)
            .group_by(Execution.status)
        )
        result = await self.session.execute(base_stmt)
        rows = result.all()

        counts: dict[str, int] = {row.status: row.count for row in rows}
        total = sum(counts.values())
        passed = counts.get("Passed", 0)
        failed = counts.get("Failed", 0)

        return {
            "total_executions": total,
            "passed": passed,
            "failed": failed,
            "blocked": counts.get("Blocked", 0),
            "not_executed": counts.get("Not Executed", 0),
            "pass_rate": round((passed / total * 100) if total > 0 else 0.0, 2),
        }

    async def automation_coverage(
        self,
        project_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Calculate the percentage of test cases marked as automated.

        Returns:
            Dict with total_test_cases, automated, manual, and automation_percentage.
        """
        from app.models.test_case import TestCase

        total_stmt = (
            select(func.count(TestCase.id))
            .where(TestCase.project_id == project_id)
            .where(TestCase.is_deleted == False)  # noqa: E712
        )
        total_result = await self.session.execute(total_stmt)
        total = total_result.scalar_one()

        automated_stmt = (
            select(func.count(TestCase.id))
            .where(TestCase.project_id == project_id)
            .where(TestCase.is_deleted == False)  # noqa: E712
            .where(TestCase.type == "Automated")
        )
        automated_result = await self.session.execute(automated_stmt)
        automated = automated_result.scalar_one()

        return {
            "total_test_cases": total,
            "automated": automated,
            "manual": total - automated,
            "automation_percentage": round(
                (automated / total * 100) if total > 0 else 0.0, 2
            ),
        }

    async def execution_trend(
        self,
        project_id: uuid.UUID,
        days: int = 30,
    ) -> list[dict[str, Any]]:
        """Get daily execution counts for the past N days.

        Returns:
            List of dicts with date, passed, failed, and total counts.
        """
        from app.models.test_execution import TestExecution as Execution
        from app.models.test_case import TestCase

        stmt = (
            select(
                func.date(Execution.created_at).label("date"),
                func.count(Execution.id).label("total"),
                func.sum(
                    case((Execution.status == "Passed", 1), else_=0)
                ).label("passed"),
                func.sum(
                    case((Execution.status == "Failed", 1), else_=0)
                ).label("failed"),
            )
            .join(TestCase, TestCase.id == Execution.test_case_id)
            .where(TestCase.project_id == project_id)
            .where(
                Execution.created_at >= func.now() - func.cast(
                    f"{days} days", type_=None
                )
            )
            .group_by(func.date(Execution.created_at))
            .order_by(func.date(Execution.created_at))
        )
        result = await self.session.execute(stmt)
        rows = result.all()

        return [
            {
                "date": str(row.date),
                "total": row.total,
                "passed": row.passed or 0,
                "failed": row.failed or 0,
            }
            for row in rows
        ]

    async def defect_density(
        self,
        project_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Calculate defect density (defects per test case) for a project.

        Returns:
            Dict with total_defects, total_test_cases, and density.
        """
        from app.models.defect import Defect
        from app.models.test_case import TestCase

        defect_stmt = (
            select(func.count(Defect.id))
            .where(Defect.project_id == project_id)
            .where(Defect.is_deleted == False)  # noqa: E712
        )
        defect_result = await self.session.execute(defect_stmt)
        total_defects = defect_result.scalar_one()

        tc_stmt = (
            select(func.count(TestCase.id))
            .where(TestCase.project_id == project_id)
            .where(TestCase.is_deleted == False)  # noqa: E712
        )
        tc_result = await self.session.execute(tc_stmt)
        total_tcs = tc_result.scalar_one()

        density = round((total_defects / total_tcs) if total_tcs > 0 else 0.0, 4)

        return {
            "total_defects": total_defects,
            "total_test_cases": total_tcs,
            "density": density,
        }

    async def release_readiness_score(
        self,
        release_id: uuid.UUID,
    ) -> dict[str, Any]:
        """Calculate a release readiness score based on test execution results.

        Score factors:
        - Execution completion percentage
        - Pass rate
        - Open defect count

        Returns:
            Dict with execution_completion, pass_rate, open_defects, and
            overall readiness_score (0-100).
        """
        from app.models.defect import Defect
        from app.models.test_execution import TestExecution as Execution
        from app.models.test_run import TestRun

        # Get all executions for runs tied to this release
        exec_stmt = (
            select(
                func.count(Execution.id).label("total"),
                func.sum(
                    case((Execution.status == "Passed", 1), else_=0)
                ).label("passed"),
                func.sum(
                    case(
                        (Execution.status == "Not Executed", 1), else_=0
                    )
                ).label("not_executed"),
            )
            .join(TestRun, TestRun.id == Execution.test_run_id)
            .where(TestRun.release_id == release_id)
        )
        exec_result = await self.session.execute(exec_stmt)
        row = exec_result.one()

        total = row.total or 0
        passed = row.passed or 0
        not_executed = row.not_executed or 0
        executed = total - not_executed

        execution_completion = round(
            (executed / total * 100) if total > 0 else 0.0, 2
        )
        pass_rate = round((passed / executed * 100) if executed > 0 else 0.0, 2)

        # Count open defects linked to this release
        defect_stmt = (
            select(func.count(Defect.id))
            .where(Defect.release_id == release_id)
            .where(Defect.is_deleted == False)  # noqa: E712
            .where(Defect.status.in_(["Open", "In Progress", "Reopened"]))
        )
        defect_result = await self.session.execute(defect_stmt)
        open_defects = defect_result.scalar_one()

        # Weighted score: 40% completion + 40% pass rate + 20% defect penalty
        defect_penalty = min(open_defects * 5, 100)  # Cap penalty at 100
        readiness_score = round(
            max(
                0,
                (execution_completion * 0.4)
                + (pass_rate * 0.4)
                - (defect_penalty * 0.2),
            ),
            2,
        )

        return {
            "total_executions": total,
            "executed": executed,
            "passed": passed,
            "execution_completion": execution_completion,
            "pass_rate": pass_rate,
            "open_defects": open_defects,
            "readiness_score": readiness_score,
        }
