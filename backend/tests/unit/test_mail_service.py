"""Unit tests for MailService + the Console/SMTP backends."""

from __future__ import annotations

import logging
from typing import Any

import pytest

from app.core.config import Settings
from app.services.mail_service import (
    ConsoleMailBackend,
    MailService,
    OutgoingEmail,
    SMTPMailBackend,
    build_mail_backend,
)


class RecordingBackend:
    def __init__(self) -> None:
        self.sent: list[OutgoingEmail] = []

    async def send(self, email: OutgoingEmail) -> None:
        self.sent.append(email)


def _settings(**overrides: Any) -> Settings:
    base = {
        "DEBUG": True,
        "SECRET_KEY": "a" * 64,
        "APP_BASE_URL": "http://localhost:3000",
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)


class TestBuildMailBackend:
    def test_defaults_to_console(self):
        backend = build_mail_backend(_settings(MAIL_BACKEND="console"))
        assert isinstance(backend, ConsoleMailBackend)

    def test_smtp_requires_host(self):
        with pytest.raises(RuntimeError, match="SMTP_HOST"):
            build_mail_backend(_settings(MAIL_BACKEND="smtp", SMTP_HOST=None))

    def test_smtp_with_host_returns_smtp_backend(self):
        backend = build_mail_backend(
            _settings(MAIL_BACKEND="smtp", SMTP_HOST="smtp.example.com")
        )
        assert isinstance(backend, SMTPMailBackend)

    def test_unknown_backend_falls_back_to_console(self):
        backend = build_mail_backend(_settings(MAIL_BACKEND="magic"))
        assert isinstance(backend, ConsoleMailBackend)


class TestConsoleBackend:
    @pytest.mark.asyncio
    async def test_logs_the_email(self, caplog):
        caplog.set_level(logging.INFO, logger="app.services.mail_service")
        backend = ConsoleMailBackend()
        await backend.send(
            OutgoingEmail(
                to="user@example.com",
                subject="Hi",
                body_text="hello world",
            )
        )
        assert any("mail_sent_console" in r.message for r in caplog.records)


class TestPasswordResetTemplate:
    @pytest.mark.asyncio
    async def test_send_password_reset_builds_expected_url_and_body(self):
        recording = RecordingBackend()
        svc = MailService(
            backend=recording,
            settings=_settings(APP_BASE_URL="https://tcm.example.com/"),
        )
        await svc.send_password_reset("user@example.com", "tok123")

        assert len(recording.sent) == 1
        email = recording.sent[0]
        assert email.to == "user@example.com"
        assert email.subject == "Reset your password"

        # URL includes the token and respects APP_BASE_URL. Trailing slash
        # on the base URL must not double up.
        assert "https://tcm.example.com/reset-password?token=tok123" in email.body_text
        # HTML part links to the same URL.
        assert email.body_html is not None
        assert "https://tcm.example.com/reset-password?token=tok123" in email.body_html

    @pytest.mark.asyncio
    async def test_send_password_reset_url_encodes_token(self):
        recording = RecordingBackend()
        svc = MailService(backend=recording, settings=_settings())
        await svc.send_password_reset("u@example.com", "abc/def+ghi=xyz")

        url_part = "token=abc%2Fdef%2Bghi%3Dxyz"
        assert url_part in recording.sent[0].body_text
