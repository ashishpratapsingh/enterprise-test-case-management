"""Release service: CRUD with status transitions."""

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationError
from app.repositories.release_repository import ReleaseRepository

# Valid status transitions for releases
_VALID_TRANSITIONS: dict[str, list[str]] = {
    "Planned": ["In Progress", "Cancelled"],
    "In Progress": ["Ready for Release", "Cancelled"],
    "Ready for Release": ["Released", "In Progress"],
    "Released": [],
    "Cancelled": ["Planned"],
}


class ReleaseService:
    """Manages release lifecycle with governed status transitions."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.release_repo = ReleaseRepository(session)

    async def get_release(self, release_id: uuid.UUID) -> Any:
        """Get a release by ID.

        Raises:
            NotFoundError: If the release does not exist.
        """
        release = await self.release_repo.get_by_id(release_id)
        if release is None:
            raise NotFoundError(f"Release with id '{release_id}' not found")
        return release

    async def list_releases_by_project(self, project_id: uuid.UUID) -> list:
        """List all releases belonging to a project."""
        return await self.release_repo.get_by_project(project_id)

    async def list_releases_by_status(self, status: str) -> list:
        """List all releases with a given status."""
        return await self.release_repo.get_by_status(status)

    async def list_releases(
        self,
        *,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        filters: dict[str, Any] | None = None,
    ) -> tuple[list, int]:
        """List releases with pagination, sorting, and filtering."""
        return await self.release_repo.get_all(
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order,
            filters=filters,
        )

    async def create_release(self, data: dict[str, Any]) -> Any:
        """Create a new release. Defaults status to 'Planned' if not set."""
        data.setdefault("status", "Planned")
        return await self.release_repo.create(data)

    async def update_release(self, release_id: uuid.UUID, data: dict[str, Any]) -> Any:
        """Update a release.

        Raises:
            NotFoundError: If the release does not exist.
        """
        release = await self.release_repo.update(release_id, data)
        if release is None:
            raise NotFoundError(f"Release with id '{release_id}' not found")
        return release

    async def transition_status(self, release_id: uuid.UUID, new_status: str) -> Any:
        """Transition a release to a new status.

        Raises:
            NotFoundError: If the release does not exist.
            ValidationError: If the transition is not allowed.
        """
        release = await self.release_repo.get_by_id(release_id)
        if release is None:
            raise NotFoundError(f"Release with id '{release_id}' not found")

        current_status = release.status
        allowed = _VALID_TRANSITIONS.get(current_status, [])
        if new_status not in allowed:
            raise ValidationError(
                f"Cannot transition from '{current_status}' to '{new_status}'. "
                f"Allowed transitions: {allowed}"
            )

        return await self.release_repo.update(release_id, {"status": new_status})

    async def delete_release(self, release_id: uuid.UUID) -> Any:
        """Soft-delete a release.

        Raises:
            NotFoundError: If the release does not exist.
        """
        release = await self.release_repo.soft_delete(release_id)
        if release is None:
            raise NotFoundError(f"Release with id '{release_id}' not found")
        return release
