"""Unit tests for TestCaseService."""

import pytest

from app.core.exceptions import NotFoundError, ValidationError
from app.services.test_case_service import TestCaseService

pytestmark = pytest.mark.asyncio


class TestCreateTestCase:
    async def test_create_generates_test_case_id_and_defaults(
        self, db_session, test_project, test_user
    ):
        """Creating a test case auto-generates TC-* id and defaults status to Draft."""
        service = TestCaseService(db_session)
        tc = await service.create_test_case(
            {"title": "Login works", "project_id": test_project.id},
            created_by=test_user.id,
        )
        assert tc.title == "Login works"
        assert tc.status == "Draft"
        assert tc.test_case_id.startswith(f"TC-{test_project.code}-")
        assert tc.created_by == test_user.id

    async def test_create_preserves_explicit_status(
        self, db_session, test_project, test_user
    ):
        service = TestCaseService(db_session)
        tc = await service.create_test_case(
            {"title": "Ready TC", "project_id": test_project.id, "status": "Ready"},
            created_by=test_user.id,
        )
        assert tc.status == "Ready"


class TestUpdateTestCase:
    async def test_update_existing(self, db_session, test_project, test_user):
        service = TestCaseService(db_session)
        tc = await service.create_test_case(
            {"title": "Old", "project_id": test_project.id},
            created_by=test_user.id,
        )
        updated = await service.update_test_case(tc.id, {"title": "New"})
        assert updated.title == "New"

    async def test_update_missing_raises(self, db_session):
        service = TestCaseService(db_session)
        with pytest.raises(NotFoundError):
            await service.update_test_case(
                "00000000-0000-0000-0000-000000000000", {"title": "x"}
            )


class TestApprovalTransitions:
    async def test_draft_to_ready(self, db_session, test_project, test_user):
        service = TestCaseService(db_session)
        tc = await service.create_test_case(
            {"title": "Flow", "project_id": test_project.id},
            created_by=test_user.id,
        )
        updated = await service.transition_approval(tc.id, "Ready")
        assert updated.status == "Ready"

    async def test_ready_to_approved(self, db_session, test_project, test_user):
        service = TestCaseService(db_session)
        tc = await service.create_test_case(
            {"title": "Flow2", "project_id": test_project.id, "status": "Ready"},
            created_by=test_user.id,
        )
        updated = await service.transition_approval(tc.id, "Approved")
        assert updated.status == "Approved"

    async def test_invalid_transition_raises(
        self, db_session, test_project, test_user
    ):
        service = TestCaseService(db_session)
        tc = await service.create_test_case(
            {"title": "Bad", "project_id": test_project.id},
            created_by=test_user.id,
        )
        # Draft -> Approved is not allowed
        with pytest.raises(ValidationError):
            await service.transition_approval(tc.id, "Approved")

    async def test_transition_missing_raises(self, db_session):
        service = TestCaseService(db_session)
        with pytest.raises(NotFoundError):
            await service.transition_approval(
                "00000000-0000-0000-0000-000000000000", "Ready"
            )


class TestCloneTestCase:
    async def test_clone_copies_fields_and_generates_new_id(
        self, db_session, test_project, test_user
    ):
        service = TestCaseService(db_session)
        source = await service.create_test_case(
            {
                "title": "Source",
                "project_id": test_project.id,
                "priority": "High",
                "type": "Regression",
                "status": "Approved",
            },
            created_by=test_user.id,
        )
        clone = await service.clone_test_case(source.id, created_by=test_user.id)
        assert clone.id != source.id
        assert clone.test_case_id != source.test_case_id
        assert clone.title == source.title
        assert clone.priority == source.priority
        assert clone.type == source.type
        # Cloned test cases always reset to Draft
        assert clone.status == "Draft"

    async def test_clone_missing_raises(self, db_session, test_user):
        service = TestCaseService(db_session)
        with pytest.raises(NotFoundError):
            await service.clone_test_case(
                "00000000-0000-0000-0000-000000000000",
                created_by=test_user.id,
            )


class TestSoftDelete:
    async def test_delete_soft_deletes(self, db_session, test_project, test_user):
        service = TestCaseService(db_session)
        tc = await service.create_test_case(
            {"title": "Gone", "project_id": test_project.id},
            created_by=test_user.id,
        )
        deleted = await service.delete_test_case(tc.id)
        assert deleted.is_deleted is True

    async def test_delete_missing_raises(self, db_session):
        service = TestCaseService(db_session)
        with pytest.raises(NotFoundError):
            await service.delete_test_case(
                "00000000-0000-0000-0000-000000000000"
            )
