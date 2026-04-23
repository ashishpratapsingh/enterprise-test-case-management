"""Project service: CRUD operations with ownership tracking."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.repositories.project_repository import ProjectRepository


class ProjectService:
    """Manages project lifecycle with ownership semantics."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.project_repo = ProjectRepository(session)

    async def get_project(self, project_id: uuid.UUID) -> Any:
        """Get a project by ID.

        Raises:
            NotFoundError: If the project does not exist.
        """
        project = await self.project_repo.get_by_id(project_id)
        if project is None:
            raise NotFoundError(f"Project with id '{project_id}' not found")
        return project

    async def get_project_by_code(self, code: str) -> Any:
        """Get a project by its unique code.

        Raises:
            NotFoundError: If no project with the given code exists.
        """
        project = await self.project_repo.get_by_code(code)
        if project is None:
            raise NotFoundError(f"Project with code '{code}' not found")
        return project

    async def get_project_with_modules(self, project_id: uuid.UUID) -> Any:
        """Get a project with its modules eagerly loaded.

        Raises:
            NotFoundError: If the project does not exist.
        """
        project = await self.project_repo.get_with_modules(project_id)
        if project is None:
            raise NotFoundError(f"Project with id '{project_id}' not found")
        return project

    async def list_projects(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        filters: dict[str, Any] | None = None,
    ) -> tuple[list, int]:
        """List projects with pagination, sorting, and filtering."""
        return await self.project_repo.get_all_with_creator(
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order,
            filters=filters,
        )

    async def create_project(
        self,
        data: dict[str, Any],
        created_by: uuid.UUID,
    ) -> Any:
        """Create a new project owned by the given user.

        Raises:
            ConflictError: If a project with the same code already exists.
        """
        existing = await self.project_repo.get_by_code(data.get("code", ""))
        if existing is not None:
            raise ConflictError(f"A project with code '{data['code']}' already exists")

        data["created_by"] = created_by
        return await self.project_repo.create(data)

    async def update_project(self, project_id: uuid.UUID, data: dict[str, Any]) -> Any:
        """Update a project.

        Raises:
            NotFoundError: If the project does not exist.
        """
        project = await self.project_repo.update(project_id, data)
        if project is None:
            raise NotFoundError(f"Project with id '{project_id}' not found")
        return project

    async def delete_project(self, project_id: uuid.UUID) -> Any:
        """Soft-delete a project.

        Raises:
            NotFoundError: If the project does not exist.
        """
        project = await self.project_repo.soft_delete(project_id)
        if project is None:
            raise NotFoundError(f"Project with id '{project_id}' not found")
        return project
