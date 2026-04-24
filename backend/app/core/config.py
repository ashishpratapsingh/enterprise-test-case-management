"""Application configuration using pydantic-settings."""

import logging
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


# Known placeholder / demo values that must never be used in production.
# Any SECRET_KEY containing one of these substrings (case-insensitive) is
# treated as unsafe.
_UNSAFE_SECRET_MARKERS = (
    "change-me",
    "your-secret",
    "dev-secret",
    "example",
    "placeholder",
)

# Minimum acceptable length for a production SECRET_KEY. Matches the
# output of ``openssl rand -hex 32``.
_MIN_SECRET_KEY_LENGTH = 32


class Settings(BaseSettings):
    """Application settings loaded from environment variables and .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Application
    PROJECT_NAME: str = "Enterprise Test Case Management"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./tcm.db"

    # Authentication
    SECRET_KEY: str = "change-me-in-production-use-a-long-random-string"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:8000"]

    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = 60

    # External Integrations (optional)
    JIRA_BASE_URL: str | None = None
    JIRA_API_TOKEN: str | None = None
    BITBUCKET_BASE_URL: str | None = None
    BITBUCKET_API_TOKEN: str | None = None

    # Mail — "console" writes emails to the logger (dev default); "smtp"
    # actually delivers via an SMTP relay.
    MAIL_BACKEND: str = "console"
    MAIL_FROM: str = "noreply@tcm.local"
    SMTP_HOST: str | None = None
    SMTP_PORT: int = 587
    SMTP_USER: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_USE_TLS: bool = True

    # Public-facing URL used to build links inside emails (e.g. password-reset).
    APP_BASE_URL: str = "http://localhost:3000"

    # Logging
    LOG_LEVEL: str = "INFO"
    LOG_FILE: str = "logs/app.log"

    @model_validator(mode="after")
    def _validate_secret_key(self) -> "Settings":
        """Reject placeholder / too-short SECRET_KEY values.

        Production mode (``DEBUG=false``) fails hard at boot. Dev mode
        (``DEBUG=true``) logs a warning but allows the app to start so
        local onboarding isn't blocked on day one.
        """
        problems = self._secret_key_problems()
        if not problems:
            return self
        msg = (
            "SECRET_KEY is not safe for production: "
            + "; ".join(problems)
            + ". Generate a strong value with `openssl rand -hex 32` and set "
            "it via the SECRET_KEY env var (or .env file)."
        )
        if self.DEBUG:
            logger.warning("insecure_secret_key_dev_only", extra={"problems": problems})
            return self
        raise ValueError(msg)

    def _secret_key_problems(self) -> list[str]:
        problems: list[str] = []
        value = (self.SECRET_KEY or "").strip()
        if not value:
            problems.append("value is empty")
            return problems
        if len(value) < _MIN_SECRET_KEY_LENGTH:
            problems.append(
                f"length {len(value)} < required {_MIN_SECRET_KEY_LENGTH}"
            )
        lowered = value.lower()
        for marker in _UNSAFE_SECRET_MARKERS:
            if marker in lowered:
                problems.append(f"contains placeholder marker '{marker}'")
                break
        return problems


@lru_cache
def get_settings() -> Settings:
    """Return cached application settings singleton."""
    return Settings()
