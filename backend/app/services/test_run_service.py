"""Test run service: CRUD and status management."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.repositories.execution_repository import ExecutionRepository
from app.repositories.test_run_repository import TestRunRepository

# Valid status transitions for test runs
_VALID_TRANSITIONS: dict[str, list[str]] = {
    "Not Started": ["In Progress", "Cancelled"],
    "In Progress": ["Completed", "Blocked", "Cancelled"],
    "Blocked": ["In Progress", "Cancelled"],
    "Completed": [],
    "Cancelled": ["Not Started"],
}


class TestRunService:
    """Manages test runs with status lifecycle management."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.run_repo = TestRunRepository(session)

    async def get_test_run(self, run_id: uuid.UUID) -> Any:
        run = await self.run_repo.get_by_id(run_id)
        if run is None:
            raise NotFoundError(f"Test run with id '{run_id}' not found")
        return run

    async def list_by_suite(self, suite_id: uuid.UUID) -> list:
        return await self.run_repo.get_by_suite(suite_id)

    async def list_by_status(self, status: str) -> list:
        return await self.run_repo.get_by_status(status)

    async def list_test_runs(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        filters: dict[str, Any] | None = None,
    ) -> tuple[list, int]:
        return await self.run_repo.get_all(
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order,
            filters=filters,
        )

    async def create_test_run(self, data: dict[str, Any]) -> Any:
        data.setdefault("status", "Not Started")
        return await self.run_repo.create(data)

    async def update_test_run(self, run_id: uuid.UUID, data: dict[str, Any]) -> Any:
        run = await self.run_repo.update(run_id, data)
        if run is None:
            raise NotFoundError(f"Test run with id '{run_id}' not found")
        return run

    async def transition_status(self, run_id: uuid.UUID, new_status: str, abort_reason: str | None = None) -> Any:
        """Transition a test run to a new status with timestamp tracking."""
        run = await self.run_repo.get_by_id(run_id)
        if run is None:
            raise NotFoundError(f"Test run with id '{run_id}' not found")

        current_status = run.status
        allowed = _VALID_TRANSITIONS.get(current_status, [])
        if new_status not in allowed:
            raise ValidationError(
                f"Cannot transition from '{current_status}' to '{new_status}'. "
                f"Allowed transitions: {allowed}"
            )

        update_data: dict[str, Any] = {"status": new_status}
        now = datetime.utcnow()

        if new_status == "In Progress" and run.started_at is None:
            update_data["started_at"] = now

            # Create execution records for each test case in the linked suite
            await self.session.refresh(run, ["test_suite"])
            suite = run.test_suite
            if suite:
                await self.session.refresh(suite, ["test_suite_cases"])
                exec_repo = ExecutionRepository(self.session)
                for sc in suite.test_suite_cases:
                    await exec_repo.create({
                        "test_run_id": str(run_id),
                        "test_case_id": sc.test_case_id,
                        "status": "Not Run",
                    })

        elif new_status in ("Completed", "Cancelled"):
            if run.started_at is None:
                update_data["started_at"] = now
            update_data["completed_at"] = now
            if new_status == "Cancelled" and abort_reason:
                update_data["abort_reason"] = abort_reason

        return await self.run_repo.update(run_id, update_data)

    async def delete_test_run(self, run_id: uuid.UUID) -> Any:
        run = await self.run_repo.soft_delete(run_id)
        if run is None:
            raise NotFoundError(f"Test run with id '{run_id}' not found")
        return run
