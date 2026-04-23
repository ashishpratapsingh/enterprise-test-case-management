"""Repository for Execution entity operations."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.repositories.base import BaseRepository


class ExecutionRepository(BaseRepository):
    """Repository for Execution-specific database operations."""

    def __init__(self, session: AsyncSession) -> None:
        from app.models.test_execution import TestExecution

        super().__init__(TestExecution, session)

    def _serialize_execution(self, item) -> dict:
        """Convert an execution ORM object to a dict with nested test_case."""
        tc = item.test_case
        test_case_dict = None
        if tc:
            test_case_dict = {
                "id": tc.id,
                "test_case_id": tc.test_case_id,
                "title": tc.title,
                "description": tc.description,
                "preconditions": tc.preconditions,
                "steps": tc.steps,
                "expected_result": tc.expected_result,
                "priority": tc.priority,
                "severity": tc.severity,
                "type": tc.type,
                "automation_status": tc.automation_status,
                "status": tc.status,
                "project_id": tc.project_id,
                "epic_id": tc.epic_id,
                "user_story_id": tc.user_story_id,
                "tags": tc.tags,
                "version": tc.version,
            }
        return {
            "id": item.id,
            "test_run_id": item.test_run_id,
            "test_case_id": item.test_case_id,
            "status": item.status,
            "executed_by": item.executed_by,
            "step_results": item.step_results,
            "actual_result": item.actual_result,
            "defect_id": item.defect_id,
            "execution_time_seconds": item.execution_time_seconds,
            "executed_at": item.executed_at.isoformat() if item.executed_at else None,
            "notes": item.notes,
            "created_at": item.created_at.isoformat() if item.created_at else None,
            "updated_at": item.updated_at.isoformat() if item.updated_at else None,
            "test_case": test_case_dict,
        }

    async def get_by_test_run(
        self,
        test_run_id: str,
        test_case_id: str | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list, int]:
        """Get all executions for a given test run with pagination and eager-loaded test_case."""
        stmt = (
            select(self.model)
            .options(selectinload(self.model.test_case))
            .where(self.model.test_run_id == test_run_id)
        )

        if test_case_id:
            stmt = stmt.where(self.model.test_case_id == test_case_id)
        if status:
            stmt = stmt.where(self.model.status == status)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_result = await self.session.execute(count_stmt)
        total = total_result.scalar_one()

        offset = (page - 1) * page_size
        stmt = stmt.offset(offset).limit(page_size)

        result = await self.session.execute(stmt)
        items = list(result.scalars().all())
        serialized = [self._serialize_execution(item) for item in items]
        return serialized, total

    async def get_by_test_case(self, test_case_id: uuid.UUID) -> list:
        """Get all executions for a given test case."""
        stmt = self._base_query().where(self.model.test_case_id == test_case_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
