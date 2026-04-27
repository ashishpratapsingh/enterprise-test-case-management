"""Unit tests for the SECRET_KEY validation on Settings."""

import pytest

from app.core.config import Settings


def _build(env: dict[str, str]) -> Settings:
    """Construct Settings ignoring any .env file on disk so tests are hermetic."""
    return Settings(_env_file=None, **env)


class TestProductionMode:
    """DEBUG=false must reject every placeholder / short SECRET_KEY."""

    def test_rejects_default_placeholder(self):
        with pytest.raises(ValueError, match="placeholder marker"):
            _build({"DEBUG": "false", "SECRET_KEY": "change-me-in-production-use-a-long-random-string"})

    def test_rejects_dev_marker(self):
        with pytest.raises(ValueError, match="placeholder marker"):
            # Contains "dev-secret", 40+ chars so only the marker check fires.
            _build(
                {
                    "DEBUG": "false",
                    "SECRET_KEY": "dev-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                }
            )

    def test_rejects_your_secret_marker(self):
        with pytest.raises(ValueError, match="placeholder marker"):
            _build(
                {
                    "DEBUG": "false",
                    "SECRET_KEY": "your-secret-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                }
            )

    def test_rejects_empty(self):
        with pytest.raises(ValueError, match="empty"):
            _build({"DEBUG": "false", "SECRET_KEY": ""})

    def test_rejects_short(self):
        # 31 chars — one below the minimum — and no markers.
        key = "a" * 31
        with pytest.raises(ValueError, match="length 31"):
            _build({"DEBUG": "false", "SECRET_KEY": key})

    def test_accepts_strong_key(self):
        # 64 hex chars, no placeholder markers.
        key = "f0" * 32
        settings = _build({"DEBUG": "false", "SECRET_KEY": key})
        assert settings.SECRET_KEY == key
        assert settings.DEBUG is False


class TestDebugMode:
    """DEBUG=true warns but still boots — local onboarding shouldn't fail."""

    def test_accepts_placeholder_with_warning(self, caplog):
        caplog.clear()
        settings = _build(
            {"DEBUG": "true", "SECRET_KEY": "change-me-in-production-blah-blah"}
        )
        assert settings.DEBUG is True
        assert any(
            "insecure_secret_key_dev_only" in r.message for r in caplog.records
        )

    def test_accepts_short_with_warning(self, caplog):
        caplog.clear()
        settings = _build({"DEBUG": "true", "SECRET_KEY": "short"})
        assert settings.DEBUG is True
        assert any(
            "insecure_secret_key_dev_only" in r.message for r in caplog.records
        )

    def test_strong_key_does_not_warn(self, caplog):
        caplog.clear()
        key = "a" * 64
        _build({"DEBUG": "true", "SECRET_KEY": key})
        assert not any(
            "insecure_secret_key_dev_only" in r.message for r in caplog.records
        )
