"""Integration tests for password-reset routes.

The ``mail_capture`` fixture swaps in a RecordingMail backend for the
duration of each test so the plaintext reset token (which used to be
echoed in DEBUG-mode API responses) can be recovered without a real SMTP
round-trip.
"""

from __future__ import annotations

from typing import Any

import pytest
import pytest_asyncio

from app.services import mail_service as mail_module

pytestmark = pytest.mark.asyncio


class RecordingMail:
    def __init__(self) -> None:
        self.sent: list[tuple[str, str]] = []

    async def send_password_reset(self, to_email: str, token: str) -> None:
        self.sent.append((to_email, token))

    async def send(self, *_args: Any, **_kwargs: Any) -> None:  # pragma: no cover
        raise NotImplementedError


@pytest_asyncio.fixture
async def mail_capture():
    recording = RecordingMail()
    mail_module.set_mail_service(recording)
    try:
        yield recording
    finally:
        mail_module.set_mail_service(None)


class TestForgotPassword:
    async def test_known_email_triggers_password_reset_mail(
        self, async_client, test_user, mail_capture
    ):
        r = await async_client.post(
            "/api/v1/auth/forgot-password",
            json={"email": test_user.email},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        # Token NEVER leaks back to the client.
        assert "reset_token" not in body["data"]
        # But a mail was sent with the real plaintext token.
        assert len(mail_capture.sent) == 1
        to, token = mail_capture.sent[0]
        assert to == test_user.email
        assert isinstance(token, str) and len(token) >= 20

    async def test_unknown_email_sends_no_mail_and_returns_200(
        self, async_client, mail_capture
    ):
        r = await async_client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "nobody-unseen@example.com"},
        )
        assert r.status_code == 200
        assert r.json()["success"] is True
        assert "reset_token" not in r.json()["data"]
        assert mail_capture.sent == []

    async def test_invalid_email_format_returns_422(self, async_client):
        r = await async_client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "not-an-email"},
        )
        assert r.status_code == 422


class TestResetPassword:
    async def _get_token(self, async_client, email: str, mail_capture: RecordingMail) -> str:
        r = await async_client.post(
            "/api/v1/auth/forgot-password", json={"email": email}
        )
        assert r.status_code == 200
        assert len(mail_capture.sent) >= 1
        return mail_capture.sent[-1][1]

    async def test_valid_token_resets_password_and_allows_login(
        self, async_client, test_user, mail_capture
    ):
        token = await self._get_token(async_client, test_user.email, mail_capture)
        r = await async_client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "BrandNew@123"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["success"] is True

        login = await async_client.post(
            "/api/v1/auth/login",
            json={"email": test_user.email, "password": "BrandNew@123"},
        )
        assert login.status_code == 200
        assert login.json()["success"] is True

    async def test_old_password_no_longer_works_after_reset(
        self, async_client, test_user, mail_capture
    ):
        token = await self._get_token(async_client, test_user.email, mail_capture)
        await async_client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "BrandNew@123"},
        )

        r = await async_client.post(
            "/api/v1/auth/login",
            json={"email": test_user.email, "password": "Test@1234"},
        )
        assert r.status_code == 401

    async def test_invalid_token_returns_400(self, async_client):
        r = await async_client.post(
            "/api/v1/auth/reset-password",
            json={"token": "not-a-real-token", "new_password": "Whatever@123"},
        )
        assert r.status_code in (400, 422)

    async def test_short_password_rejected_by_validation(self, async_client):
        r = await async_client.post(
            "/api/v1/auth/reset-password",
            json={"token": "some-token", "new_password": "short"},
        )
        assert r.status_code == 422

    async def test_token_cannot_be_reused(
        self, async_client, test_user, mail_capture
    ):
        token = await self._get_token(async_client, test_user.email, mail_capture)
        first = await async_client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "First@1234"},
        )
        assert first.status_code == 200

        second = await async_client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "Second@123"},
        )
        assert second.status_code in (400, 422)
