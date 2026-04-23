"""Unit tests for DefectService."""

import pytest

from app.core.exceptions import NotFoundError, ValidationError
from app.services.defect_service import DefectService

pytestmark = pytest.mark.asyncio


async def _make_defect(db_session, test_project, test_user, **overrides):
    service = DefectService(db_session)
    data = {
        "title": "Something broke",
        "project_id": test_project.id,
        "severity": "High",
        "priority": "High",
        "reported_by": test_user.id,
    }
    data.update(overrides)
    return service, await service.create_defect(data)


class TestCreateDefect:
    async def test_create_generates_defect_id_and_defaults_status(
        self, db_session, test_project, test_user
    ):
        _, defect = await _make_defect(db_session, test_project, test_user)
        assert defect.title == "Something broke"
        assert defect.status == "Open"
        assert defect.defect_id.startswith(f"BUG-{test_project.code}-")


class TestGetDefect:
    async def test_get_existing(self, db_session, test_project, test_user):
        service, defect = await _make_defect(db_session, test_project, test_user)
        found = await service.get_defect(defect.id)
        assert found.id == defect.id

    async def test_get_missing_raises(self, db_session):
        service = DefectService(db_session)
        with pytest.raises(NotFoundError):
            await service.get_defect("00000000-0000-0000-0000-000000000000")


class TestStatusTransitions:
    async def test_open_to_in_progress(self, db_session, test_project, test_user):
        service, defect = await _make_defect(db_session, test_project, test_user)
        updated = await service.transition_status(defect.id, "In Progress")
        assert updated.status == "In Progress"

    async def test_in_progress_to_fixed(self, db_session, test_project, test_user):
        service, defect = await _make_defect(db_session, test_project, test_user)
        await service.transition_status(defect.id, "In Progress")
        updated = await service.transition_status(defect.id, "Fixed")
        assert updated.status == "Fixed"

    async def test_invalid_transition_raises(
        self, db_session, test_project, test_user
    ):
        service, defect = await _make_defect(db_session, test_project, test_user)
        # Open -> Fixed is not allowed
        with pytest.raises(ValidationError):
            await service.transition_status(defect.id, "Fixed")

    async def test_duplicate_has_no_transitions(
        self, db_session, test_project, test_user
    ):
        service, defect = await _make_defect(
            db_session, test_project, test_user, status="Duplicate"
        )
        with pytest.raises(ValidationError):
            await service.transition_status(defect.id, "Open")

    async def test_transition_missing_raises(self, db_session):
        service = DefectService(db_session)
        with pytest.raises(NotFoundError):
            await service.transition_status(
                "00000000-0000-0000-0000-000000000000", "In Progress"
            )


class TestUpdateDefect:
    async def test_update_existing(self, db_session, test_project, test_user):
        service, defect = await _make_defect(db_session, test_project, test_user)
        updated = await service.update_defect(defect.id, {"title": "Updated"})
        assert updated.title == "Updated"

    async def test_update_missing_raises(self, db_session):
        service = DefectService(db_session)
        with pytest.raises(NotFoundError):
            await service.update_defect(
                "00000000-0000-0000-0000-000000000000", {"title": "x"}
            )


class TestDelete:
    async def test_delete_soft_deletes(self, db_session, test_project, test_user):
        service, defect = await _make_defect(db_session, test_project, test_user)
        deleted = await service.delete_defect(defect.id)
        assert deleted.is_deleted is True

    async def test_delete_missing_raises(self, db_session):
        service = DefectService(db_session)
        with pytest.raises(NotFoundError):
            await service.delete_defect("00000000-0000-0000-0000-000000000000")
