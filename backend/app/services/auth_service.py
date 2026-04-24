"""Authentication service: login, registration, token refresh, password reset."""

import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, ExpiredSignatureError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import ConflictError, UnauthorizedError, ValidationError
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)

# Password reset tokens are valid for 60 minutes from issuance.
PASSWORD_RESET_TTL = timedelta(minutes=60)


def _hash_reset_token(token: str) -> str:
    """Return the sha256 hex digest of a reset token, used as the stored form."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


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

    async def request_password_reset(self, email: str) -> dict[str, Any]:
        """Begin a password-reset flow for the given email.

        Always returns a generic success response regardless of whether the
        email exists in the database — this prevents attackers from using the
        endpoint to enumerate valid accounts. When the account exists, a
        fresh random token is generated, its sha256 hash is stored with a
        60-minute expiry, and the plaintext token is returned to the caller
        *only* when DEBUG is enabled (so local/dev flows can complete the
        reset without needing email infrastructure). In production, the
        plaintext token would instead be mailed to the user.
        """
        settings = get_settings()
        user = await self.user_repo.get_by_email(email)
        response: dict[str, Any] = {
            "message": "If that email is registered, a reset link has been issued.",
        }
        if user is None or not user.is_active:
            return response

        token = secrets.token_urlsafe(32)
        user.password_reset_token = _hash_reset_token(token)
        user.password_reset_expires = datetime.now(timezone.utc) + PASSWORD_RESET_TTL
        await self.session.flush()

        logger.info(
            "password_reset_requested",
            extra={"user_id": str(user.id), "email": user.email},
        )

        # In a real deployment we would email the token; exposing it in the
        # response is strictly a dev affordance. Never return it when not in DEBUG.
        if settings.DEBUG:
            response["reset_token"] = token
        return response

    async def reset_password(self, token: str, new_password: str) -> dict[str, Any]:
        """Complete a password reset using a previously issued token.

        Raises:
            ValidationError: If the token is unknown, already used, or expired.
        """
        if not token:
            raise ValidationError("Reset token is required")

        token_hash = _hash_reset_token(token)
        user = await self.user_repo.get_by_reset_token(token_hash)
        if user is None:
            raise ValidationError("Invalid or already-used reset token")

        expires = user.password_reset_expires
        if expires is None:
            raise ValidationError("Invalid reset token")

        # DB may return naive datetimes (SQLite); normalise to UTC for compare.
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            # Clear the stale token so it can't be retried.
            user.password_reset_token = None
            user.password_reset_expires = None
            await self.session.flush()
            raise ValidationError("Reset token has expired")

        user.hashed_password = get_password_hash(new_password)
        user.password_reset_token = None
        user.password_reset_expires = None
        await self.session.flush()

        logger.info("password_reset_completed", extra={"user_id": str(user.id)})
        return {"message": "Password has been reset successfully"}
