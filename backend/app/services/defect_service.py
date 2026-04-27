"""Defect service: CRUD with status transitions."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.repositories.defect_repository import DefectRepository

# Valid defect status transitions
_VALID_TRANSITIONS: dict[str, list[str]] = {
    "Open": ["In Progress", "Won't Fix", "Duplicate"],
    "In Progress": ["Fixed", "Open"],
    "Fixed": ["Verified", "Reopened"],
    "Verified": ["Closed", "Reopened"],
    "Reopened": ["In Progress", "Won't Fix"],
    "Closed": ["Reopened"],
    "Won't Fix": ["Reopened"],
    "Duplicate": [],
}


class DefectService:
    """Manages defects with governed status transitions."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.defect_repo = DefectRepository(session)

    async def get_defect(self, defect_id: uuid.UUID) -> Any:
        """Get a defect by ID.

        Raises:
            NotFoundError: If the defect does not exist.
        """
        defect = await self.defect_repo.get_by_id(defect_id)
        if defect is None:
            raise NotFoundError(f"Defect with id '{defect_id}' not found")
        return defect

    async def list_defects_by_project(self, project_id: uuid.UUID) -> list:
        """List all defects belonging to a project."""
        return await self.defect_repo.get_by_project(project_id)

    async def list_defects_by_status(self, status: str) -> list:
        """List all defects with a given status."""
        return await self.defect_repo.get_by_status(status)

    async def list_defects(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        filters: dict[str, Any] | None = None,
    ) -> tuple[list, int]:
        """List defects with pagination, sorting, and filtering."""
        search = None
        if filters and "search" in filters:
            search = filters.pop("search")

        return await self.defect_repo.get_all_with_relations(
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order,
            filters=filters if filters else None,
            search=search,
        )

    async def create_defect(self, data: dict[str, Any]) -> Any:
        """Create a new defect with auto-generated defect_id."""
        from sqlalchemy import select as sa_select

        from app.models.project import Project

        # Generate BUG-{PROJECT_CODE}-{SEQUENCE}
        project_code = None
        project_id = data.get("project_id")
        if project_id:
            result = await self.session.execute(
                sa_select(Project.code).where(Project.id == str(project_id))
            )
            project_code = result.scalar_one_or_none()

        data["defect_id"] = await self.defect_repo.get_next_defect_id(project_code)
        data.setdefault("status", "Open")
        return await self.defect_repo.create(data)

    async def update_defect(self, defect_id: uuid.UUID, data: dict[str, Any]) -> Any:
        """Update a defect.

        Raises:
            NotFoundError: If the defect does not exist.
        """
        defect = await self.defect_repo.update(defect_id, data)
        if defect is None:
            raise NotFoundError(f"Defect with id '{defect_id}' not found")
        return defect

    async def transition_status(self, defect_id: uuid.UUID, new_status: str) -> Any:
        """Transition a defect to a new status.

        Raises:
            NotFoundError: If the defect does not exist.
            ValidationError: If the transition is not allowed.
        """
        defect = await self.defect_repo.get_by_id(defect_id)
        if defect is None:
            raise NotFoundError(f"Defect with id '{defect_id}' not found")

        current_status = defect.status
        allowed = _VALID_TRANSITIONS.get(current_status, [])
        if new_status not in allowed:
            raise ValidationError(
                f"Cannot transition from '{current_status}' to '{new_status}'. "
                f"Allowed transitions: {allowed}"
            )

        return await self.defect_repo.update(defect_id, {"status": new_status})

    async def delete_defect(self, defect_id: uuid.UUID) -> Any:
        """Soft-delete a defect.

        Raises:
            NotFoundError: If the defect does not exist.
        """
        defect = await self.defect_repo.soft_delete(defect_id)
        if defect is None:
            raise NotFoundError(f"Defect with id '{defect_id}' not found")
        return defect

    async def list_by_execution(self, execution_id: str) -> list:
        """Return all non-deleted defects attached to a given test execution."""
        from sqlalchemy import select as sa_select
        from sqlalchemy.orm import selectinload

        from app.models.defect import Defect

        stmt = (
            sa_select(Defect)
            .options(
                selectinload(Defect.project),
                selectinload(Defect.reporter),
                selectinload(Defect.assignee),
                selectinload(Defect.test_case),
                selectinload(Defect.epic),
                selectinload(Defect.user_story),
            )
            .where(Defect.test_execution_id == execution_id)
            .where(Defect.is_deleted == False)  # noqa: E712
            .order_by(Defect.step_number.asc(), Defect.created_at.desc())
        )
        result = await self.session.execute(stmt)
        items = result.scalars().all()
        return [self.defect_repo._serialize(item) for item in items]

    async def attach_to_step(
        self,
        *,
        execution_id: str,
        step_number: int,
        data: dict[str, Any],
    ) -> Any:
        """Create a new defect scoped to a step, or link an existing one.

        If `data["defect_id"]` (the UUID, not the human BUG-* code) is present,
        the existing defect is updated to point at this execution/step.
        Otherwise, a new defect is created with the execution/step fields set.
        """
        existing_id = data.pop("defect_id", None)
        if existing_id:
            update = {"test_execution_id": execution_id, "step_number": step_number}
            defect = await self.defect_repo.update(existing_id, update)
            if defect is None:
                raise NotFoundError(f"Defect with id '{existing_id}' not found")
            return defect

        data["test_execution_id"] = execution_id
        data["step_number"] = step_number
        return await self.create_defect(data)

    async def detach_from_step(self, defect_id: str) -> Any:
        """Unlink a defect from its execution/step without deleting it."""
        defect = await self.defect_repo.update(
            defect_id,
            {"test_execution_id": None, "step_number": None},
        )
        if defect is None:
            raise NotFoundError(f"Defect with id '{defect_id}' not found")
        return defect

    # ── Bulk operations ────────────────────────────────────────────────
    #
    # All bulk methods follow the same pattern: best-effort per-id, never
    # abort on a single failure. Returns a {succeeded, failed} report so
    # the UI can show partial progress (e.g., "5 of 7 deleted; 2 not
    # found"). Each per-row mutation goes through the existing single-row
    # method so audit hooks fire as normal.

    async def bulk_delete(self, defect_ids: list[Any]) -> dict[str, list]:
        """Soft-delete each defect. Missing IDs are reported, not raised."""
        succeeded: list[str] = []
        failed: list[dict[str, str]] = []
        for did in defect_ids:
            try:
                await self.delete_defect(did)
                succeeded.append(str(did))
            except NotFoundError as e:
                failed.append({"id": str(did), "error": str(e)})
        return {"succeeded": succeeded, "failed": failed}

    async def bulk_transition_status(
        self, defect_ids: list[Any], new_status: str
    ) -> dict[str, list]:
        """Transition each defect to ``new_status``. Disallowed transitions
        and missing IDs are skipped and reported."""
        succeeded: list[str] = []
        failed: list[dict[str, str]] = []
        for did in defect_ids:
            try:
                await self.transition_status(did, new_status)
                succeeded.append(str(did))
            except (NotFoundError, ValidationError) as e:
                failed.append({"id": str(did), "error": str(e)})
        return {"succeeded": succeeded, "failed": failed}

    async def bulk_assign(
        self, defect_ids: list[Any], assigned_to: Any | None
    ) -> dict[str, list]:
        """Assign every defect to ``assigned_to`` (or unassign if None).

        Does not validate that the user exists — the FK constraint will
        surface that. Missing defect IDs are reported, not raised.
        """
        succeeded: list[str] = []
        failed: list[dict[str, str]] = []
        for did in defect_ids:
            try:
                await self.update_defect(
                    did, {"assigned_to": str(assigned_to) if assigned_to else None}
                )
                succeeded.append(str(did))
            except NotFoundError as e:
                failed.append({"id": str(did), "error": str(e)})
        return {"succeeded": succeeded, "failed": failed}
