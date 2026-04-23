"""Unit tests for TestSuiteService."""

import pytest

from app.core.exceptions import NotFoundError
from app.services.test_case_service import TestCaseService
from app.services.test_suite_service import TestSuiteService

pytestmark = pytest.mark.asyncio


async def _make_suite(db_session, test_project, test_user, **overrides):
    service = TestSuiteService(db_session)
    data = {
        "name": "Smoke Suite",
        "project_id": test_project.id,
        "created_by": test_user.id,
        "is_active": True,
    }
    data.update(overrides)
    return service, await service.create_suite(data)


class TestCreateSuite:
    async def test_create_basic(self, db_session, test_project, test_user):
        _, suite = await _make_suite(db_session, test_project, test_user)
        assert suite.name == "Smoke Suite"
        assert suite.project_id == test_project.id
        assert suite.is_active is True

    async def test_create_with_test_cases(
        self, db_session, test_project, test_user
    ):
        tc_service = TestCaseService(db_session)
        tc1 = await tc_service.create_test_case(
            {"title": "TC1", "project_id": test_project.id},
            created_by=test_user.id,
        )
        tc2 = await tc_service.create_test_case(
            {"title": "TC2", "project_id": test_project.id},
            created_by=test_user.id,
        )
        service, suite = await _make_suite(
            db_session,
            test_project,
            test_user,
            test_case_ids=[tc1.id, tc2.id],
        )
        reloaded = await service.get_suite_with_cases(suite.id)
        assert len(reloaded.test_suite_cases) == 2

    async def test_create_strips_non_model_fields(
        self, db_session, test_project, test_user
    ):
        # epic_id and user_story_id should be silently dropped
        _, suite = await _make_suite(
            db_session,
            test_project,
            test_user,
            epic_id="ignored",
            user_story_id="ignored",
        )
        assert not hasattr(suite, "epic_id") or getattr(suite, "epic_id", None) != "ignored"


class TestUpdateSuite:
    async def test_update_existing(self, db_session, test_project, test_user):
        service, suite = await _make_suite(db_session, test_project, test_user)
        updated = await service.update_suite(suite.id, {"name": "Renamed"})
        assert updated.name == "Renamed"

    async def test_update_missing_raises(self, db_session):
        service = TestSuiteService(db_session)
        with pytest.raises(NotFoundError):
            await service.update_suite(
                "00000000-0000-0000-0000-000000000000", {"name": "x"}
            )


class TestAddRemoveTestCase:
    async def test_add_test_case(self, db_session, test_project, test_user):
        tc_service = TestCaseService(db_session)
        tc = await tc_service.create_test_case(
            {"title": "For suite", "project_id": test_project.id},
            created_by=test_user.id,
        )
        service, suite = await _make_suite(db_session, test_project, test_user)
        await service.add_test_case(suite.id, tc.id)
        reloaded = await service.get_suite_with_cases(suite.id)
        assert len(reloaded.test_suite_cases) == 1
        assert reloaded.test_suite_cases[0].test_case_id == tc.id

    async def test_add_duplicate_is_idempotent(
        self, db_session, test_project, test_user
    ):
        tc_service = TestCaseService(db_session)
        tc = await tc_service.create_test_case(
            {"title": "Dupe", "project_id": test_project.id},
            created_by=test_user.id,
        )
        service, suite = await _make_suite(db_session, test_project, test_user)
        await service.add_test_case(suite.id, tc.id)
        await service.add_test_case(suite.id, tc.id)  # should not raise
        reloaded = await service.get_suite_with_cases(suite.id)
        assert len(reloaded.test_suite_cases) == 1

    async def test_remove_test_case(self, db_session, test_project, test_user):
        tc_service = TestCaseService(db_session)
        tc = await tc_service.create_test_case(
            {"title": "Removable", "project_id": test_project.id},
            created_by=test_user.id,
        )
        service, suite = await _make_suite(db_session, test_project, test_user)
        await service.add_test_case(suite.id, tc.id)
        await service.remove_test_case(suite.id, tc.id)
        reloaded = await service.get_suite_with_cases(suite.id)
        assert len(reloaded.test_suite_cases) == 0

    async def test_add_to_missing_suite_raises(
        self, db_session, test_project, test_user
    ):
        tc_service = TestCaseService(db_session)
        tc = await tc_service.create_test_case(
            {"title": "Lonely", "project_id": test_project.id},
            created_by=test_user.id,
        )
        service = TestSuiteService(db_session)
        with pytest.raises(NotFoundError):
            await service.add_test_case(
                "00000000-0000-0000-0000-000000000000", tc.id
            )


class TestDelete:
    async def test_delete_soft_deletes(self, db_session, test_project, test_user):
        service, suite = await _make_suite(db_session, test_project, test_user)
        deleted = await service.delete_suite(suite.id)
        assert deleted.is_deleted is True

    async def test_delete_missing_raises(self, db_session):
        service = TestSuiteService(db_session)
        with pytest.raises(NotFoundError):
            await service.delete_suite("00000000-0000-0000-0000-000000000000")
