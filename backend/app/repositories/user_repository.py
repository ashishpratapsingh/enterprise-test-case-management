"""Repository for User entity operations."""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    """Repository for User-specific database operations."""

    def __init__(self, session: AsyncSession) -> None:
        super().__init__(User, session)

    async def get_by_email(self, email: str) -> User | None:
        """Get a user by their email address."""
        stmt = self._base_query().where(User.email == email)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_with_role(self, user_id: uuid.UUID) -> User | None:
        """Get a user with their role eagerly loaded."""
        stmt = (
            self._base_query()
            .options(joinedload(User.role))
            .where(User.id == user_id)
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_reset_token(self, token_hash: str) -> User | None:
        """Look up a user by the sha256 hash of their password-reset token."""
        stmt = self._base_query().where(User.password_reset_token == token_hash)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()
