"""Execution service: execute tests, update status, and link defects."""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.repositories.execution_repository import ExecutionRepository


class ExecutionService:
    """Manages test execution records, step-level results, and defect linking."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.execution_repo = ExecutionRepository(session)

    async def get_execution(self, execution_id: str) -> Any:
        execution = await self.execution_repo.get_by_id(execution_id)
        if execution is None:
            raise NotFoundError(f"Execution with id '{execution_id}' not found")
        return execution

    async def get_executions_by_run(
        self,
        test_run_id: str,
        test_case_id: str | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list, int]:
        return await self.execution_repo.get_by_test_run(
            test_run_id,
            test_case_id=test_case_id,
            status=status,
            page=page,
            page_size=page_size,
        )

    async def create_execution(
        self,
        execution_data: dict[str, Any],
        executed_by: str,
    ) -> Any:
        execution_data["executed_by"] = executed_by
        execution_data.setdefault("status", "Not Run")
        return await self.execution_repo.create(execution_data)

    async def update_execution(
        self,
        execution_id: str,
        execution_data: dict[str, Any],
        updated_by: str,
    ) -> Any:
        execution = await self.execution_repo.get_by_id(execution_id)
        if execution is None:
            raise NotFoundError(f"Execution with id '{execution_id}' not found")

        update_data: dict[str, Any] = {}

        if "status" in execution_data:
            update_data["status"] = execution_data["status"]

        if "notes" in execution_data:
            update_data["notes"] = execution_data["notes"]

        if "step_results" in execution_data:
            update_data["step_results"] = execution_data["step_results"]

        if "actual_result" in execution_data:
            update_data["actual_result"] = execution_data["actual_result"]

        if "duration_seconds" in execution_data:
            update_data["execution_time_seconds"] = execution_data["duration_seconds"]

        if "defect_id" in execution_data:
            update_data["defect_id"] = execution_data["defect_id"]

        update_data["executed_by"] = updated_by
        update_data["executed_at"] = datetime.utcnow()

        result = await self.execution_repo.update(execution_id, update_data)
        if result is None:
            raise NotFoundError(f"Execution with id '{execution_id}' not found")
        return result

    async def list_by_test_run(self, test_run_id: uuid.UUID) -> list:
        items, _ = await self.execution_repo.get_by_test_run(str(test_run_id))
        return items

    async def list_by_test_case(self, test_case_id: uuid.UUID) -> list:
        return await self.execution_repo.get_by_test_case(test_case_id)

    async def execute_test(
        self,
        data: dict[str, Any],
        executed_by: uuid.UUID,
    ) -> Any:
        data["executed_by"] = executed_by
        data.setdefault("status", "Not Executed")
        step_results = data.get("step_results")
        if step_results is not None:
            if not isinstance(step_results, list):
                raise ValidationError("step_results must be a list of step result dicts")
        return await self.execution_repo.create(data)

    async def update_status(
        self,
        execution_id: uuid.UUID,
        status: str,
        notes: str | None = None,
    ) -> Any:
        update_data: dict[str, Any] = {"status": status}
        if notes is not None:
            update_data["notes"] = notes
        execution = await self.execution_repo.update(execution_id, update_data)
        if execution is None:
            raise NotFoundError(f"Execution with id '{execution_id}' not found")
        return execution

    async def link_defect(
        self,
        execution_id: uuid.UUID,
        defect_id: uuid.UUID,
    ) -> Any:
        execution = await self.execution_repo.get_by_id(execution_id)
        if execution is None:
            raise NotFoundError(f"Execution with id '{execution_id}' not found")
        linked_defects = getattr(execution, "linked_defect_ids", None) or []
        if defect_id not in linked_defects:
            linked_defects.append(defect_id)
        return await self.execution_repo.update(
            execution_id, {"linked_defect_ids": linked_defects}
        )
