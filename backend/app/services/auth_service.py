"""Authentication service: login, registration, and token refresh."""

import uuid
from typing import Any

from jose import JWTError, ExpiredSignatureError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, UnauthorizedError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.repositories.user_repository import UserRepository


class AuthService:
    """Handles authentication workflows: login, registration, token refresh."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.user_repo = UserRepository(session)

    async def login(self, email: str, password: str) -> dict[str, Any]:
        """Authenticate a user and return access + refresh tokens.

        Raises:
            UnauthorizedError: If credentials are invalid or the user is inactive.
        """
        user = await self.user_repo.get_by_email(email)
        if user is None or not verify_password(password, user.hashed_password):
            raise UnauthorizedError("Invalid email or password")

        if not user.is_active:
            raise UnauthorizedError("User account is deactivated")

        access_token = create_access_token(
            subject=str(user.id),
            extra_claims={"role_id": str(user.role_id)},
        )
        refresh_token = create_refresh_token(subject=str(user.id))

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user_id": str(user.id),
        }

    async def refresh_token(self, token: str) -> dict[str, Any]:
        """Issue a new access token from a valid refresh token.

        Raises:
            UnauthorizedError: If the refresh token is invalid or expired.
        """
        try:
            payload = decode_token(token)
        except ExpiredSignatureError:
            raise UnauthorizedError("Refresh token has expired")
        except JWTError:
            raise UnauthorizedError("Invalid refresh token")

        if payload.get("type") != "refresh":
            raise UnauthorizedError("Invalid token type — expected a refresh token")

        user_id = payload.get("sub")
        if user_id is None:
            raise UnauthorizedError("Invalid refresh token payload")

        user = await self.user_repo.get_by_id(user_id)
        if user is None or not user.is_active:
            raise UnauthorizedError("User not found or deactivated")

        access_token = create_access_token(
            subject=str(user.id),
            extra_claims={"role_id": str(user.role_id)},
        )

        return {
            "access_token": access_token,
            "token_type": "bearer",
        }

    async def register(
        self,
        email: str,
        password: str,
        full_name: str,
        role_id: uuid.UUID,
    ) -> Any:
        """Register a new user with a hashed password.

        Raises:
            ConflictError: If a user with the given email already exists.
        """
        existing = await self.user_repo.get_by_email(email)
        if existing is not None:
            raise ConflictError(f"A user with email '{email}' already exists")

        hashed = get_password_hash(password)
        user = await self.user_repo.create(
            {
                "email": email,
                "hashed_password": hashed,
                "full_name": full_name,
                "role_id": role_id,
            }
        )
        return user
