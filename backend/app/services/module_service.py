"""Module service: CRUD scoped to a project."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.repositories.module_repository import ModuleRepository
from app.repositories.project_repository import ProjectRepository


class ModuleService:
    """Manages modules within the scope of a project."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.module_repo = ModuleRepository(session)
        self.project_repo = ProjectRepository(session)

    async def _ensure_project_exists(self, project_id: uuid.UUID) -> None:
        """Verify that the parent project exists.

        Raises:
            NotFoundError: If the project does not exist.
        """
        project = await self.project_repo.get_by_id(project_id)
        if project is None:
            raise NotFoundError(f"Project with id '{project_id}' not found")

    async def get_module(self, module_id: uuid.UUID) -> Any:
        """Get a module by ID.

        Raises:
            NotFoundError: If the module does not exist.
        """
        module = await self.module_repo.get_by_id(module_id)
        if module is None:
            raise NotFoundError(f"Module with id '{module_id}' not found")
        return module

    async def list_modules_by_project(self, project_id: uuid.UUID) -> list:
        """List all modules belonging to a project.

        Raises:
            NotFoundError: If the project does not exist.
        """
        await self._ensure_project_exists(project_id)
        return await self.module_repo.get_by_project(project_id)

    async def create_module(
        self,
        project_id: uuid.UUID,
        data: dict[str, Any],
    ) -> Any:
        """Create a new module within a project.

        Raises:
            NotFoundError: If the project does not exist.
        """
        await self._ensure_project_exists(project_id)
        data["project_id"] = project_id
        return await self.module_repo.create(data)

    async def update_module(self, module_id: uuid.UUID, data: dict[str, Any]) -> Any:
        """Update a module.

        Raises:
            NotFoundError: If the module does not exist.
        """
        module = await self.module_repo.update(module_id, data)
        if module is None:
            raise NotFoundError(f"Module with id '{module_id}' not found")
        return module

    async def delete_module(self, module_id: uuid.UUID) -> Any:
        """Soft-delete a module.

        Raises:
            NotFoundError: If the module does not exist.
        """
        module = await self.module_repo.soft_delete(module_id)
        if module is None:
            raise NotFoundError(f"Module with id '{module_id}' not found")
        return module
