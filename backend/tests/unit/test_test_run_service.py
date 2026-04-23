"""Unit tests for TestRunService."""

import pytest

from app.core.exceptions import NotFoundError, ValidationError
from app.services.test_run_service import TestRunService
from app.services.test_suite_service import TestSuiteService

pytestmark = pytest.mark.asyncio


async def _make_run(db_session, test_project, test_user, **overrides):
    suite_service = TestSuiteService(db_session)
    suite = await suite_service.create_suite(
        {
            "name": "Suite for run",
            "project_id": test_project.id,
            "created_by": test_user.id,
        }
    )
    service = TestRunService(db_session)
    data = {
        "name": "Run 1",
        "test_suite_id": suite.id,
        "created_by": test_user.id,
    }
    data.update(overrides)
    return service, await service.create_test_run(data)


class TestCreateRun:
    async def test_create_defaults_to_not_started(
        self, db_session, test_project, test_user
    ):
        _, run = await _make_run(db_session, test_project, test_user)
        assert run.status == "Not Started"
        assert run.name == "Run 1"


class TestGetRun:
    async def test_get_existing(self, db_session, test_project, test_user):
        service, run = await _make_run(db_session, test_project, test_user)
        found = await service.get_test_run(run.id)
        assert found.id == run.id

    async def test_get_missing_raises(self, db_session):
        service = TestRunService(db_session)
        with pytest.raises(NotFoundError):
            await service.get_test_run("00000000-0000-0000-0000-000000000000")


class TestTransitions:
    async def test_not_started_to_in_progress_sets_started_at(
        self, db_session, test_project, test_user
    ):
        service, run = await _make_run(db_session, test_project, test_user)
        updated = await service.transition_status(run.id, "In Progress")
        assert updated.status == "In Progress"
        assert updated.started_at is not None

    async def test_in_progress_to_completed_sets_completed_at(
        self, db_session, test_project, test_user
    ):
        service, run = await _make_run(db_session, test_project, test_user)
        await service.transition_status(run.id, "In Progress")
        updated = await service.transition_status(run.id, "Completed")
        assert updated.status == "Completed"
        assert updated.completed_at is not None

    async def test_cancel_records_abort_reason(
        self, db_session, test_project, test_user
    ):
        service, run = await _make_run(db_session, test_project, test_user)
        updated = await service.transition_status(
            run.id, "Cancelled", abort_reason="mid-run stop"
        )
        assert updated.status == "Cancelled"
        assert updated.abort_reason == "mid-run stop"
        assert updated.completed_at is not None

    async def test_invalid_transition_raises(
        self, db_session, test_project, test_user
    ):
        service, run = await _make_run(db_session, test_project, test_user)
        # Not Started -> Completed is not allowed
        with pytest.raises(ValidationError):
            await service.transition_status(run.id, "Completed")

    async def test_completed_is_terminal(
        self, db_session, test_project, test_user
    ):
        service, run = await _make_run(db_session, test_project, test_user)
        await service.transition_status(run.id, "In Progress")
        await service.transition_status(run.id, "Completed")
        with pytest.raises(ValidationError):
            await service.transition_status(run.id, "In Progress")

    async def test_transition_missing_raises(self, db_session):
        service = TestRunService(db_session)
        with pytest.raises(NotFoundError):
            await service.transition_status(
                "00000000-0000-0000-0000-000000000000", "In Progress"
            )


class TestUpdateRun:
    async def test_update_existing(self, db_session, test_project, test_user):
        service, run = await _make_run(db_session, test_project, test_user)
        updated = await service.update_test_run(run.id, {"name": "Renamed"})
        assert updated.name == "Renamed"

    async def test_update_missing_raises(self, db_session):
        service = TestRunService(db_session)
        with pytest.raises(NotFoundError):
            await service.update_test_run(
                "00000000-0000-0000-0000-000000000000", {"name": "x"}
            )


class TestDelete:
    async def test_delete_soft_deletes(self, db_session, test_project, test_user):
        service, run = await _make_run(db_session, test_project, test_user)
        deleted = await service.delete_test_run(run.id)
        assert deleted.is_deleted is True

    async def test_delete_missing_raises(self, db_session):
        service = TestRunService(db_session)
        with pytest.raises(NotFoundError):
            await service.delete_test_run(
                "00000000-0000-0000-0000-000000000000"
            )
