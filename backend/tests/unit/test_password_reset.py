"""Unit tests for AuthService password-reset flow."""

from datetime import datetime, timedelta, timezone

import pytest

from app.core.exceptions import ValidationError
from app.core.security import verify_password
from app.services.auth_service import (
    AuthService,
    PASSWORD_RESET_TTL,
    _hash_reset_token,
)

pytestmark = pytest.mark.asyncio


class TestRequestPasswordReset:
    async def test_known_email_issues_token_in_debug(
        self, db_session, test_user, monkeypatch
    ):
        """When DEBUG=true, a plaintext reset_token is included in the response."""
        from app.services import auth_service

        def fake_settings():
            class S:
                DEBUG = True
            return S()

        monkeypatch.setattr(auth_service, "get_settings", fake_settings)

        service = AuthService(db_session)
        result = await service.request_password_reset(test_user.email)
        assert "reset_token" in result

        # The DB now stores the sha256 hash of the issued token and an expiry.
        await db_session.refresh(test_user)
        assert test_user.password_reset_token == _hash_reset_token(result["reset_token"])
        assert test_user.password_reset_expires is not None
        expires = test_user.password_reset_expires
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        # Token should expire ~60 minutes from now.
        delta = expires - datetime.now(timezone.utc)
        assert timedelta(minutes=55) < delta <= PASSWORD_RESET_TTL

    async def test_unknown_email_returns_generic_message(self, db_session, monkeypatch):
        """Non-existent emails must NOT leak the reset_token — prevents enumeration."""
        from app.services import auth_service

        class S:
            DEBUG = True

        monkeypatch.setattr(auth_service, "get_settings", lambda: S())

        service = AuthService(db_session)
        result = await service.request_password_reset("nobody@tcm.local")
        assert "reset_token" not in result
        assert "message" in result

    async def test_inactive_user_returns_generic_message(
        self, db_session, test_user, monkeypatch
    ):
        from app.services import auth_service

        class S:
            DEBUG = True

        monkeypatch.setattr(auth_service, "get_settings", lambda: S())

        test_user.is_active = False
        await db_session.flush()

        service = AuthService(db_session)
        result = await service.request_password_reset(test_user.email)
        assert "reset_token" not in result

    async def test_production_never_leaks_token(
        self, db_session, test_user, monkeypatch
    ):
        """DEBUG=false must never include the plaintext token in the response."""
        from app.services import auth_service

        class S:
            DEBUG = False

        monkeypatch.setattr(auth_service, "get_settings", lambda: S())

        service = AuthService(db_session)
        result = await service.request_password_reset(test_user.email)
        assert "reset_token" not in result
        # But the DB still stores a hashed token so the user can complete the flow
        # once they receive the emailed plaintext version.
        await db_session.refresh(test_user)
        assert test_user.password_reset_token is not None


class TestResetPassword:
    async def _issue_token(self, db_session, user, monkeypatch):
        from app.services import auth_service

        class S:
            DEBUG = True

        monkeypatch.setattr(auth_service, "get_settings", lambda: S())
        service = AuthService(db_session)
        result = await service.request_password_reset(user.email)
        return service, result["reset_token"]

    async def test_valid_token_updates_password_and_clears_token(
        self, db_session, test_user, monkeypatch
    ):
        service, token = await self._issue_token(db_session, test_user, monkeypatch)
        await service.reset_password(token=token, new_password="NewP@ssw0rd1")

        await db_session.refresh(test_user)
        assert verify_password("NewP@ssw0rd1", test_user.hashed_password) is True
        assert test_user.password_reset_token is None
        assert test_user.password_reset_expires is None

    async def test_token_cannot_be_reused(
        self, db_session, test_user, monkeypatch
    ):
        service, token = await self._issue_token(db_session, test_user, monkeypatch)
        await service.reset_password(token=token, new_password="FirstP@ss1")

        with pytest.raises(ValidationError):
            await service.reset_password(token=token, new_password="SecondP@ss1")

    async def test_invalid_token_raises(self, db_session):
        service = AuthService(db_session)
        with pytest.raises(ValidationError):
            await service.reset_password(
                token="totally-not-a-real-token", new_password="ValidP@ss1"
            )

    async def test_empty_token_raises(self, db_session):
        service = AuthService(db_session)
        with pytest.raises(ValidationError):
            await service.reset_password(token="", new_password="ValidP@ss1")

    async def test_expired_token_raises_and_is_cleared(
        self, db_session, test_user, monkeypatch
    ):
        service, token = await self._issue_token(db_session, test_user, monkeypatch)

        # Backdate expiry so the token is already dead.
        test_user.password_reset_expires = datetime.now(timezone.utc) - timedelta(minutes=1)
        await db_session.flush()

        with pytest.raises(ValidationError):
            await service.reset_password(token=token, new_password="ValidP@ss1")

        # Expired-token check should clear the stored token as a side effect.
        await db_session.refresh(test_user)
        assert test_user.password_reset_token is None
        assert test_user.password_reset_expires is None
