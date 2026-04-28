"""Test case service: CRUD, versioning, cloning, bulk upload, and approval workflow."""

import csv
import io
import uuid
from typing import Any

from sqlalchemy import delete as sa_delete
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import select as sa_select

from app.core.exceptions import NotFoundError, ValidationError
from app.models.project import Project
from app.models.test_suite_case import TestSuiteCase
from app.repositories.test_case_repository import TestCaseRepository
from app.repositories.test_case_version_repository import (
    TestCaseVersionRepository,
)

# Approval workflow transitions
_APPROVAL_TRANSITIONS: dict[str, list[str]] = {
    "Draft": ["Ready"],
    "Ready": ["Approved", "Draft"],
    "Approved": ["Draft"],
}


class TestCaseService:
    """Manages test cases with auto-ID generation, versioning, cloning,
    bulk CSV upload, and approval workflow.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.tc_repo = TestCaseRepository(session)
        self.version_repo = TestCaseVersionRepository(session)

    # ── CRUD ────────────────────────────────────────────────────────────

    async def get_test_case(self, test_case_id: uuid.UUID) -> Any:
        """Get a test case by its primary key.

        Returns a wire-safe serialized dict with slim assignee/creator
        relationships (no password hashes leaked).

        Raises:
            NotFoundError: If the test case does not exist.
        """
        tc = await self.tc_repo.get_by_id_enriched(test_case_id)
        if tc is None:
            raise NotFoundError(f"Test case with id '{test_case_id}' not found")
        return tc

    async def get_test_case_by_test_case_id(self, test_case_id: str) -> Any:
        """Get a test case by its human-readable ID (e.g., TC-00001).

        Raises:
            NotFoundError: If no test case has this ID.
        """
        tc = await self.tc_repo.get_by_test_case_id(test_case_id)
        if tc is None:
            raise NotFoundError(f"Test case '{test_case_id}' not found")
        return tc

    async def list_test_cases(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        filters: dict[str, Any] | None = None,
    ) -> tuple[list, int]:
        """List test cases with pagination, sorting, and filtering."""
        return await self.tc_repo.get_all(
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order,
            filters=filters,
        )

    async def list_by_project(self, project_id: uuid.UUID) -> list:
        """List all test cases belonging to a project."""
        return await self.tc_repo.get_by_project(project_id)

    async def list_by_module(self, module_id: uuid.UUID) -> list:
        """List all test cases belonging to a module."""
        return await self.tc_repo.get_by_module(module_id)

    async def search_test_cases(
        self,
        *,
        title: str | None = None,
        tags: list[str] | None = None,
        status: str | None = None,
        test_type: str | None = None,
        project_id: uuid.UUID | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list, int]:
        """Search test cases by title, tags, status, and/or type."""
        return await self.tc_repo.search(
            title=title,
            tags=tags,
            status=status,
            test_type=test_type,
            project_id=project_id,
            page=page,
            page_size=page_size,
        )

    async def create_test_case(
        self,
        data: dict[str, Any],
        created_by: uuid.UUID,
    ) -> Any:
        """Create a test case with an auto-generated test_case_id (TC-CODE-XXXX).

        The status defaults to 'Draft' if not provided.
        """
        # Look up project code for the test_case_id prefix
        project_code = None
        project_id = data.get("project_id")
        if project_id:
            result = await self.session.execute(
                sa_select(Project.code).where(Project.id == str(project_id))
            )
            project_code = result.scalar_one_or_none()
        data["test_case_id"] = await self.tc_repo.get_next_test_case_id(project_code)
        data.setdefault("status", "Draft")
        data["created_by"] = created_by
        tc = await self.tc_repo.create(data)
        return tc

    async def update_test_case(
        self,
        test_case_id: uuid.UUID,
        data: dict[str, Any],
    ) -> Any:
        """Update a test case.

        Raises:
            NotFoundError: If the test case does not exist.
        """
        tc = await self.tc_repo.update(test_case_id, data)
        if tc is None:
            raise NotFoundError(f"Test case with id '{test_case_id}' not found")
        return tc

    async def delete_test_case(self, test_case_id: uuid.UUID) -> Any:
        """Soft-delete a test case and remove it from any linked test suites.

        Raises:
            NotFoundError: If the test case does not exist.
        """
        # Remove from all test suites
        await self.session.execute(
            sa_delete(TestSuiteCase).where(TestSuiteCase.test_case_id == str(test_case_id))
        )
        tc = await self.tc_repo.soft_delete(test_case_id)
        if tc is None:
            raise NotFoundError(f"Test case with id '{test_case_id}' not found")
        return tc

    # ── Clone ───────────────────────────────────────────────────────────

    async def clone_test_case(
        self,
        source_id: uuid.UUID,
        created_by: uuid.UUID,
    ) -> Any:
        """Deep-copy a test case with a new auto-generated ID.

        Clones all fields except id, test_case_id, created_at, and updated_at.

        Raises:
            NotFoundError: If the source test case does not exist.
        """
        source = await self.tc_repo.get_by_id(source_id)
        if source is None:
            raise NotFoundError(f"Test case with id '{source_id}' not found")

        # Build the clone data from the source, excluding identity fields
        exclude_fields = {
            "id",
            "test_case_id",
            "created_at",
            "updated_at",
            "is_deleted",
        }
        clone_data: dict[str, Any] = {}
        for key in source.__table__.columns.keys():
            if key not in exclude_fields:
                clone_data[key] = getattr(source, key)

        clone_data["status"] = "Draft"
        return await self.create_test_case(clone_data, created_by=created_by)

    # ── Bulk Upload ─────────────────────────────────────────────────────

    async def bulk_upload_csv(
        self,
        csv_content: str,
        project_id: uuid.UUID,
        created_by: uuid.UUID,
    ) -> list:
        """Parse a CSV string and create test cases in bulk.

        Expected CSV columns: title, description, type, priority, preconditions.
        Additional columns are stored if they map to model fields.

        Returns:
            List of created test case objects.
        """
        reader = csv.DictReader(io.StringIO(csv_content))
        created: list = []

        for row in reader:
            data: dict[str, Any] = {
                k.strip(): v.strip() for k, v in row.items() if v is not None
            }
            data["project_id"] = project_id
            tc = await self.create_test_case(data, created_by=created_by)
            created.append(tc)

        return created

    # ── Versioning ──────────────────────────────────────────────────────

    async def create_version(
        self,
        test_case_id: uuid.UUID,
        created_by: uuid.UUID,
    ) -> Any:
        """Snapshot the current state of a test case as a new version.

        Raises:
            NotFoundError: If the test case does not exist.
        """
        tc = await self.tc_repo.get_by_id(test_case_id)
        if tc is None:
            raise NotFoundError(f"Test case with id '{test_case_id}' not found")

        # Determine next version number
        existing_versions = await self.version_repo.get_versions_for_test_case(
            test_case_id
        )
        next_version = (existing_versions[0].version_number + 1) if existing_versions else 1

        # Build snapshot data from the test case
        snapshot_fields = {}
        for key in tc.__table__.columns.keys():
            if key not in {"id", "created_at", "updated_at", "is_deleted"}:
                snapshot_fields[key] = getattr(tc, key)

        version_data = {
            "test_case_id": test_case_id,
            "version_number": next_version,
            "snapshot": snapshot_fields,
            "created_by": created_by,
        }

        return await self.version_repo.create(version_data)

    async def get_versions(self, test_case_id: uuid.UUID) -> list:
        """Get all versions of a test case."""
        return await self.version_repo.get_versions_for_test_case(test_case_id)

    # ── Approval Workflow ───────────────────────────────────────────────

    async def transition_approval(
        self,
        test_case_id: uuid.UUID,
        new_status: str,
    ) -> Any:
        """Transition a test case through the approval workflow.

        Workflow: Draft -> Ready -> Approved (with allowed reverse transitions).

        Raises:
            NotFoundError: If the test case does not exist.
            ValidationError: If the transition is not allowed.
        """
        tc = await self.tc_repo.get_by_id(test_case_id)
        if tc is None:
            raise NotFoundError(f"Test case with id '{test_case_id}' not found")

        current_status = tc.status
        allowed = _APPROVAL_TRANSITIONS.get(current_status, [])
        if new_status not in allowed:
            raise ValidationError(
                f"Cannot transition from '{current_status}' to '{new_status}'. "
                f"Allowed transitions: {allowed}"
            )

        return await self.tc_repo.update(test_case_id, {"status": new_status})

    # ── Bulk operations ─────────────────────────────────────────────────
    #
    # Same partial-success contract as DefectService.bulk_*: each row
    # is updated/transitioned/deleted independently; per-row failures
    # (NotFound, illegal transition, validation) land in `failed` and
    # never abort the whole batch.

    async def bulk_delete(self, test_case_ids: list[Any]) -> dict[str, list]:
        """Soft-delete each test case (and unlink from suites)."""
        succeeded: list[str] = []
        failed: list[dict[str, str]] = []
        for tcid in test_case_ids:
            try:
                await self.delete_test_case(tcid)
                succeeded.append(str(tcid))
            except NotFoundError as e:
                failed.append({"id": str(tcid), "error": str(e)})
        return {"succeeded": succeeded, "failed": failed}

    async def bulk_transition_approval(
        self, test_case_ids: list[Any], new_status: str
    ) -> dict[str, list]:
        """Run approval-workflow transitions on many test cases. Honours
        the same Draft → Ready → Approved table as the per-row endpoint;
        invalid transitions are reported, not raised."""
        succeeded: list[str] = []
        failed: list[dict[str, str]] = []
        for tcid in test_case_ids:
            try:
                await self.transition_approval(tcid, new_status)
                succeeded.append(str(tcid))
            except (NotFoundError, ValidationError) as e:
                failed.append({"id": str(tcid), "error": str(e)})
        return {"succeeded": succeeded, "failed": failed}

    async def bulk_update(
        self,
        test_case_ids: list[Any],
        *,
        priority: str | None = None,
        type_: str | None = None,
        automation_status: str | None = None,
        assigned_to: str | None = None,
        unassign: bool = False,
    ) -> dict[str, list]:
        """Plain-field bulk edit: priority, type, automation_status,
        assignee. Status changes go through ``bulk_transition_approval``
        because of the workflow rules.

        Caller must signal "clear assignee" via ``unassign=True``
        because ``assigned_to=None`` already means "leave unchanged" in
        this signature.
        """
        update_data: dict[str, Any] = {}
        if priority is not None:
            update_data["priority"] = priority
        if type_ is not None:
            update_data["type"] = type_
        if automation_status is not None:
            update_data["automation_status"] = automation_status
        if unassign:
            update_data["assigned_to"] = None
        elif assigned_to is not None:
            update_data["assigned_to"] = assigned_to

        if not update_data:
            raise ValidationError("At least one field must be provided to bulk_update")

        succeeded: list[str] = []
        failed: list[dict[str, str]] = []
        for tcid in test_case_ids:
            try:
                await self.update_test_case(tcid, update_data)
                succeeded.append(str(tcid))
            except (NotFoundError, ValidationError) as e:
                failed.append({"id": str(tcid), "error": str(e)})
        return {"succeeded": succeeded, "failed": failed}
