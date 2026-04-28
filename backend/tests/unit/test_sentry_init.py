"""Unit tests for the Sentry init guard.

We don't actually want to fire Sentry network calls in tests, so the
"active" path is verified by patching ``sentry_sdk.init`` and asserting
the call happened — not by sending real events.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

from app.core.config import Settings
from app.core.sentry import init_sentry


def _settings(**overrides: Any) -> Settings:
    base = {
        "DEBUG": True,
        "SECRET_KEY": "a" * 64,
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)


class TestInitSentry:
    def test_dormant_when_dsn_unset(self):
        """Default behaviour: SENTRY_DSN unset → no init, no SDK
        side effects, returns False."""
        with patch("sentry_sdk.init") as mock_init:
            assert init_sentry(_settings(SENTRY_DSN=None)) is False
            assert mock_init.call_count == 0

    def test_dormant_when_dsn_blank_string(self):
        """Whitespace-only DSN treated as unset — guards against
        ``SENTRY_DSN=`` lines in .env files."""
        with patch("sentry_sdk.init") as mock_init:
            assert init_sentry(_settings(SENTRY_DSN="   ")) is False
            assert mock_init.call_count == 0

    def test_initialises_when_dsn_set(self):
        """DSN set → SDK init fires once with the configured params."""
        with patch("sentry_sdk.init") as mock_init:
            ok = init_sentry(_settings(
                SENTRY_DSN="https://abc@sentry.example.com/1",
                SENTRY_ENVIRONMENT="staging",
                SENTRY_TRACES_SAMPLE_RATE=0.25,
            ))
            assert ok is True
            assert mock_init.call_count == 1
            kwargs = mock_init.call_args.kwargs
            assert kwargs["dsn"] == "https://abc@sentry.example.com/1"
            assert kwargs["environment"] == "staging"
            assert kwargs["traces_sample_rate"] == 0.25
            assert kwargs["send_default_pii"] is False
