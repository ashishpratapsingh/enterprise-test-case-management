"""Outbound email for the app.

Two backends:

* ``ConsoleMailBackend`` — writes the message to the application logger.
  Used in local dev and tests so nothing is actually delivered. The reset
  URL for a forgot-password flow shows up in the backend log stream.

* ``SMTPMailBackend`` — delivers via SMTP using ``aiosmtplib``.
  Configuration (host, port, user, password, TLS) comes from the
  application ``Settings``. Selected by setting ``MAIL_BACKEND=smtp``.

The public entry point is the ``MailService`` class. Domain flows call
high-level helpers like ``send_password_reset(...)``; the underlying
``send(...)`` is protocol-level and not usually called directly.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol
from urllib.parse import urlencode

import aiosmtplib
from email.message import EmailMessage

from app.core.config import Settings, get_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OutgoingEmail:
    to: str
    subject: str
    body_text: str
    body_html: str | None = None


class MailBackend(Protocol):
    async def send(self, email: OutgoingEmail) -> None: ...  # pragma: no cover


class ConsoleMailBackend:
    """Log-only backend. Not a no-op — emits a structured log record so
    developers can see exactly what would have been sent."""

    async def send(self, email: OutgoingEmail) -> None:
        logger.info(
            "mail_sent_console",
            extra={
                "to": email.to,
                "subject": email.subject,
                "body_preview": email.body_text[:500],
            },
        )


class SMTPMailBackend:
    """Real SMTP delivery via aiosmtplib."""

    def __init__(self, settings: Settings) -> None:
        if not settings.SMTP_HOST:
            raise RuntimeError(
                "MAIL_BACKEND=smtp but SMTP_HOST is not configured"
            )
        self._settings = settings

    async def send(self, email: OutgoingEmail) -> None:
        s = self._settings
        msg = EmailMessage()
        msg["From"] = s.MAIL_FROM
        msg["To"] = email.to
        msg["Subject"] = email.subject
        msg.set_content(email.body_text)
        if email.body_html:
            msg.add_alternative(email.body_html, subtype="html")

        await aiosmtplib.send(
            msg,
            hostname=s.SMTP_HOST,
            port=s.SMTP_PORT,
            username=s.SMTP_USER,
            password=s.SMTP_PASSWORD,
            start_tls=s.SMTP_USE_TLS,
        )
        logger.info(
            "mail_sent_smtp",
            extra={"to": email.to, "subject": email.subject},
        )


def build_mail_backend(settings: Settings | None = None) -> MailBackend:
    """Pick a backend based on ``MAIL_BACKEND``. Defaults to console."""
    s = settings or get_settings()
    backend = (s.MAIL_BACKEND or "console").lower()
    if backend == "smtp":
        return SMTPMailBackend(s)
    return ConsoleMailBackend()


class MailService:
    """Domain-level email helpers."""

    def __init__(self, backend: MailBackend | None = None, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._backend = backend or build_mail_backend(self._settings)

    async def send(self, email: OutgoingEmail) -> None:
        await self._backend.send(email)

    async def send_password_reset(self, to_email: str, token: str) -> None:
        """Build and send the password-reset email for a given user."""
        reset_url = self._build_reset_url(token)
        subject = "Reset your password"
        body_text = (
            "Hello,\n\n"
            "A password reset was requested for your account.\n"
            "Open this link to choose a new password:\n\n"
            f"{reset_url}\n\n"
            "If you didn't request this, you can ignore this email — your "
            "existing password will continue to work.\n"
        )
        body_html = (
            "<p>Hello,</p>"
            "<p>A password reset was requested for your account.</p>"
            f'<p><a href="{reset_url}">Reset your password</a></p>'
            "<p>If you didn't request this, you can ignore this email.</p>"
        )
        await self.send(
            OutgoingEmail(
                to=to_email,
                subject=subject,
                body_text=body_text,
                body_html=body_html,
            )
        )

    def _build_reset_url(self, token: str) -> str:
        base = self._settings.APP_BASE_URL.rstrip("/")
        return f"{base}/reset-password?{urlencode({'token': token})}"


_default_mail_service: MailService | None = None


def get_mail_service() -> MailService:
    """Return a process-wide MailService singleton."""
    global _default_mail_service
    if _default_mail_service is None:
        _default_mail_service = MailService()
    return _default_mail_service


def set_mail_service(service: MailService | None) -> None:
    """Override the singleton — used by tests."""
    global _default_mail_service
    _default_mail_service = service
