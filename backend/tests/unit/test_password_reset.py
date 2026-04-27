"""Unit tests for AuthService password-reset flow."""

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

from app.core.exceptions import ValidationError
from app.core.security import verify_password
from app.services.auth_service import (
    AuthService,
    PASSWORD_RESET_TTL,
    _hash_reset_token,
)

pytestmark = pytest.mark.asyncio


class RecordingMail:
    """Minimal MailService stand-in. Captures every password-reset send."""

    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []
        self.fail_with: Exception | None = None

    async def send_password_reset(self, to_email: str, token: str) -> None:
        if self.fail_with is not None:
            raise self.fail_with
        self.sent.append((to_email, token))

    async def send(self, *_args: Any, **_kwargs: Any) -> None:  # pragma: no cover
        raise NotImplementedError


class TestRequestPasswordReset:
    async def test_known_email_emails_the_token(self, db_session, test_user):
        mail = RecordingMail()
        service = AuthService(db_session, mail_service=mail)
        result = await service.request_password_reset(test_user.email)

        # Response is always the generic message — token never leaks back.
        assert "reset_token" not in result
        assert "message" in result

        # One mail sent, containing the plaintext token.
        assert len(mail.sent) == 1
        to, token = mail.sent[0]
        assert to == test_user.email
        assert isinstance(token, str) and len(token) >= 20

        # The stored hash must match sha256(plaintext).
        await db_session.refresh(test_user)
        assert test_user.password_reset_token == _hash_reset_token(token)
        assert test_user.password_reset_expires is not None
        expires = test_user.password_reset_expires
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        delta = expires - datetime.now(timezone.utc)
        assert timedelta(minutes=55) < delta <= PASSWORD_RESET_TTL

    async def test_unknown_email_sends_nothing(self, db_session):
        mail = RecordingMail()
        service = AuthService(db_session, mail_service=mail)
        result = await service.request_password_reset("nobody-unseen@example.com")
        assert "reset_token" not in result
        assert "message" in result
        assert mail.sent == []

    async def test_inactive_user_sends_nothing(self, db_session, test_user):
        test_user.is_active = False
        await db_session.flush()

        mail = RecordingMail()
        service = AuthService(db_session, mail_service=mail)
        await service.request_password_reset(test_user.email)
        assert mail.sent == []

    async def test_mail_failure_does_not_leak_to_caller(
        self, db_session, test_user
    ):
        """If the mail backend raises, the API response must still be the
        generic message so an attacker can't tell accounts apart."""
        mail = RecordingMail()
        mail.fail_with = RuntimeError("smtp down")
        service = AuthService(db_session, mail_service=mail)

        result = await service.request_password_reset(test_user.email)
        assert "reset_token" not in result
        assert "message" in result
        # The token still got stored — mail failure shouldn't undo that.
        await db_session.refresh(test_user)
        assert test_user.password_reset_token is not None


class TestResetPassword:
    async def _issue_token(self, db_session, user) -> tuple[AuthService, str]:
        mail = RecordingMail()
        service = AuthService(db_session, mail_service=mail)
        await service.request_password_reset(user.email)
        assert len(mail.sent) == 1
        return service, mail.sent[0][1]

    async def test_valid_token_updates_password_and_clears_token(
        self, db_session, test_user
    ):
        service, token = await self._issue_token(db_session, test_user)
        await service.reset_password(token=token, new_password="NewP@ssw0rd1")

        await db_session.refresh(test_user)
        assert verify_password("NewP@ssw0rd1", test_user.hashed_password) is True
        assert test_user.password_reset_token is None
        assert test_user.password_reset_expires is None

    async def test_token_cannot_be_reused(self, db_session, test_user):
        service, token = await self._issue_token(db_session, test_user)
        await service.reset_password(token=token, new_password="FirstP@ss1")
        with pytest.raises(ValidationError):
            await service.reset_password(token=token, new_password="SecondP@ss1")

    async def test_invalid_token_raises(self, db_session):
        service = AuthService(db_session, mail_service=RecordingMail())
        with pytest.raises(ValidationError):
            await service.reset_password(
                token="totally-not-a-real-token", new_password="ValidP@ss1"
            )

    async def test_empty_token_raises(self, db_session):
        service = AuthService(db_session, mail_service=RecordingMail())
        with pytest.raises(ValidationError):
            await service.reset_password(token="", new_password="ValidP@ss1")

    async def test_expired_token_raises_and_is_cleared(
        self, db_session, test_user
    ):
        service, token = await self._issue_token(db_session, test_user)

        test_user.password_reset_expires = datetime.now(timezone.utc) - timedelta(minutes=1)
        await db_session.flush()

        with pytest.raises(ValidationError):
            await service.reset_password(token=token, new_password="ValidP@ss1")

        await db_session.refresh(test_user)
        assert test_user.password_reset_token is None
        assert test_user.password_reset_expires is None
