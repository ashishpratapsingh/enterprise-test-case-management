"""Requirement service: CRUD with external (JIRA) linking."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.repositories.requirement_repository import RequirementRepository


class RequirementService:
    """Manages requirements with optional JIRA linking."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.requirement_repo = RequirementRepository(session)

    async def get_requirement(self, requirement_id: uuid.UUID) -> Any:
        """Get a requirement by ID.

        Raises:
            NotFoundError: If the requirement does not exist.
        """
        req = await self.requirement_repo.get_by_id(requirement_id)
        if req is None:
            raise NotFoundError(f"Requirement with id '{requirement_id}' not found")
        return req

    async def list_requirements_by_project(self, project_id: uuid.UUID) -> list:
        """List all requirements belonging to a project."""
        return await self.requirement_repo.get_by_project(project_id)

    async def list_requirements(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        filters: dict[str, Any] | None = None,
    ) -> tuple[list, int]:
        """List requirements with pagination, sorting, and filtering."""
        return await self.requirement_repo.get_all(
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order,
            filters=filters,
        )

    async def create_requirement(self, data: dict[str, Any]) -> Any:
        """Create a new requirement."""
        return await self.requirement_repo.create(data)

    async def update_requirement(
        self,
        requirement_id: uuid.UUID,
        data: dict[str, Any],
    ) -> Any:
        """Update a requirement.

        Raises:
            NotFoundError: If the requirement does not exist.
        """
        req = await self.requirement_repo.update(requirement_id, data)
        if req is None:
            raise NotFoundError(f"Requirement with id '{requirement_id}' not found")
        return req

    async def delete_requirement(self, requirement_id: uuid.UUID) -> Any:
        """Soft-delete a requirement.

        Raises:
            NotFoundError: If the requirement does not exist.
        """
        req = await self.requirement_repo.soft_delete(requirement_id)
        if req is None:
            raise NotFoundError(f"Requirement with id '{requirement_id}' not found")
        return req

    async def link_external_id(
        self,
        requirement_id: uuid.UUID,
        external_id: str,
    ) -> Any:
        """Link a requirement to an external tracking ID (e.g., a JIRA issue key).

        Raises:
            NotFoundError: If the requirement does not exist.
            ConflictError: If another requirement is already linked to this external ID.
        """
        existing = await self.requirement_repo.get_by_external_id(external_id)
        if existing is not None and existing.id != requirement_id:
            raise ConflictError(
                f"External ID '{external_id}' is already linked to "
                f"requirement '{existing.id}'"
            )

        req = await self.requirement_repo.update(
            requirement_id, {"external_id": external_id}
        )
        if req is None:
            raise NotFoundError(f"Requirement with id '{requirement_id}' not found")
        return req

    async def get_by_external_id(self, external_id: str) -> Any:
        """Get a requirement by its external tracking ID.

        Raises:
            NotFoundError: If no requirement is linked to the given external ID.
        """
        req = await self.requirement_repo.get_by_external_id(external_id)
        if req is None:
            raise NotFoundError(
                f"No requirement linked to external ID '{external_id}'"
            )
        return req
