"""Unit tests for authentication service utilities."""

from datetime import timedelta

from jose import ExpiredSignatureError
import pytest

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_password_hash,
    verify_password,
)

settings = get_settings()


class TestPasswordHashing:
    """Tests for password hashing and verification."""

    def test_hash_password(self):
        """Hashing a password should produce a bcrypt hash."""
        hashed = get_password_hash("SecurePass@123")
        assert hashed != "SecurePass@123"
        assert hashed.startswith("$2b$")

    def test_verify_correct_password(self):
        """verify_password should return True for a matching password."""
        hashed = get_password_hash("SecurePass@123")
        assert verify_password("SecurePass@123", hashed) is True

    def test_verify_wrong_password(self):
        """verify_password should return False for a non-matching password."""
        hashed = get_password_hash("SecurePass@123")
        assert verify_password("WrongPassword", hashed) is False


class TestAccessToken:
    """Tests for JWT access token creation and decoding."""

    def test_create_access_token_default_expiry(self):
        """Access token should be a valid JWT with correct subject."""
        token = create_access_token(subject="user-123")
        payload = decode_token(token)
        assert payload["sub"] == "user-123"
        assert payload["type"] == "access"

    def test_create_access_token_custom_expiry(self):
        """Access token should respect a custom expiration delta."""
        token = create_access_token(
            subject="user-456",
            expires_delta=timedelta(minutes=5),
        )
        payload = decode_token(token)
        assert payload["sub"] == "user-456"

    def test_create_access_token_extra_claims(self):
        """Extra claims should be embedded in the token payload."""
        token = create_access_token(
            subject="user-789",
            extra_claims={"role": "Admin"},
        )
        payload = decode_token(token)
        assert payload["role"] == "Admin"

    def test_expired_token_raises(self):
        """Decoding an expired token should raise an error."""
        token = create_access_token(
            subject="user-000",
            expires_delta=timedelta(seconds=-1),
        )
        with pytest.raises(ExpiredSignatureError):
            decode_token(token)


class TestRefreshToken:
    """Tests for JWT refresh token creation."""

    def test_create_refresh_token(self):
        """Refresh token should be valid and have type 'refresh'."""
        token = create_refresh_token(subject="user-111")
        payload = decode_token(token)
        assert payload["sub"] == "user-111"
        assert payload["type"] == "refresh"

    def test_refresh_token_custom_expiry(self):
        """Refresh token should respect a custom expiration delta."""
        token = create_refresh_token(
            subject="user-222",
            expires_delta=timedelta(days=1),
        )
        payload = decode_token(token)
        assert payload["sub"] == "user-222"
