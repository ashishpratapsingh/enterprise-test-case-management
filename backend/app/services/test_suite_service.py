"""Test suite service: CRUD, add/remove test cases."""

import uuid
from typing import Any

from sqlalchemy import select, delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.test_suite_case import TestSuiteCase
from app.repositories.test_suite_repository import TestSuiteRepository


class TestSuiteService:
    """Manages test suites and their associated test cases."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.suite_repo = TestSuiteRepository(session)

    async def get_suite(self, suite_id: uuid.UUID) -> Any:
        suite = await self.suite_repo.get_by_id(suite_id)
        if suite is None:
            raise NotFoundError(f"Test suite with id '{suite_id}' not found")
        return suite

    async def get_suite_with_cases(self, suite_id: uuid.UUID) -> Any:
        suite = await self.suite_repo.get_with_cases(suite_id)
        if suite is None:
            raise NotFoundError(f"Test suite with id '{suite_id}' not found")
        return suite

    async def list_suites(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        filters: dict[str, Any] | None = None,
    ) -> tuple[list, int]:
        return await self.suite_repo.get_all(
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order,
            filters=filters,
        )

    async def create_suite(self, data: dict[str, Any]) -> Any:
        # Extract test_case_ids before creating the suite
        test_case_ids = data.pop("test_case_ids", [])
        # Remove fields not on the model (used for filtering only)
        data.pop("epic_id", None)
        data.pop("user_story_id", None)
        suite = await self.suite_repo.create(data)

        # Add associations
        for idx, tc_id in enumerate(test_case_ids):
            assoc = TestSuiteCase(
                test_suite_id=suite.id,
                test_case_id=str(tc_id),
                order=idx,
            )
            self.session.add(assoc)
        if test_case_ids:
            await self.session.flush()

        return suite

    async def update_suite(self, suite_id: uuid.UUID, data: dict[str, Any]) -> Any:
        # Extract test_case_ids if provided
        test_case_ids = data.pop("test_case_ids", None)
        # Remove fields not on the model (used for filtering only)
        data.pop("epic_id", None)
        data.pop("user_story_id", None)

        suite = await self.suite_repo.update(suite_id, data)
        if suite is None:
            raise NotFoundError(f"Test suite with id '{suite_id}' not found")

        # If test_case_ids provided, replace all associations
        if test_case_ids is not None:
            await self.session.execute(
                sa_delete(TestSuiteCase).where(TestSuiteCase.test_suite_id == str(suite_id))
            )
            for idx, tc_id in enumerate(test_case_ids):
                assoc = TestSuiteCase(
                    test_suite_id=str(suite_id),
                    test_case_id=str(tc_id),
                    order=idx,
                )
                self.session.add(assoc)
            await self.session.flush()

        return suite

    async def delete_suite(self, suite_id: uuid.UUID) -> Any:
        suite = await self.suite_repo.soft_delete(suite_id)
        if suite is None:
            raise NotFoundError(f"Test suite with id '{suite_id}' not found")
        return suite

    async def add_test_case(
        self,
        suite_id: uuid.UUID,
        test_case_id: uuid.UUID,
        order: int | None = None,
    ) -> Any:
        suite = await self.suite_repo.get_by_id(suite_id)
        if suite is None:
            raise NotFoundError(f"Test suite with id '{suite_id}' not found")

        # Check if already exists
        existing = await self.session.execute(
            select(TestSuiteCase).where(
                TestSuiteCase.test_suite_id == str(suite_id),
                TestSuiteCase.test_case_id == str(test_case_id),
            )
        )
        if existing.scalar_one_or_none() is not None:
            return suite  # Already exists, skip silently

        # Determine order
        if order is None:
            count_result = await self.session.execute(
                select(TestSuiteCase).where(TestSuiteCase.test_suite_id == str(suite_id))
            )
            order = len(count_result.all())

        assoc = TestSuiteCase(
            test_suite_id=str(suite_id),
            test_case_id=str(test_case_id),
            order=order,
        )
        self.session.add(assoc)
        await self.session.flush()
        return suite

    async def remove_test_case(
        self,
        suite_id: uuid.UUID,
        test_case_id: uuid.UUID,
    ) -> None:
        await self.session.execute(
            sa_delete(TestSuiteCase).where(
                TestSuiteCase.test_suite_id == str(suite_id),
                TestSuiteCase.test_case_id == str(test_case_id),
            )
        )
        await self.session.flush()
