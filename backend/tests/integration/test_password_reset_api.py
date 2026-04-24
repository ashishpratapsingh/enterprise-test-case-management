"""Integration tests for password-reset routes."""

import pytest

pytestmark = pytest.mark.asyncio


class TestForgotPassword:
    async def test_known_email_returns_200_with_dev_token(
        self, async_client, test_user, monkeypatch
    ):
        """With DEBUG enabled, the response carries the plaintext reset_token."""
        from app.services import auth_service

        class S:
            DEBUG = True

        monkeypatch.setattr(auth_service, "get_settings", lambda: S())

        r = await async_client.post(
            "/api/v1/auth/forgot-password",
            json={"email": test_user.email},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["success"] is True
        assert "reset_token" in body["data"]
        assert isinstance(body["data"]["reset_token"], str)
        assert len(body["data"]["reset_token"]) >= 20

    async def test_unknown_email_still_returns_200_without_token(
        self, async_client, monkeypatch
    ):
        from app.services import auth_service

        class S:
            DEBUG = True

        monkeypatch.setattr(auth_service, "get_settings", lambda: S())

        r = await async_client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "nobody-unseen@example.com"},
        )
        assert r.status_code == 200
        assert r.json()["success"] is True
        assert "reset_token" not in r.json()["data"]

    async def test_invalid_email_format_returns_422(self, async_client):
        r = await async_client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "not-an-email"},
        )
        assert r.status_code == 422


class TestResetPassword:
    async def _get_token(self, async_client, email, monkeypatch):
        from app.services import auth_service

        class S:
            DEBUG = True

        monkeypatch.setattr(auth_service, "get_settings", lambda: S())

        r = await async_client.post(
            "/api/v1/auth/forgot-password", json={"email": email}
        )
        return r.json()["data"]["reset_token"]

    async def test_valid_token_resets_password_and_allows_login(
        self, async_client, test_user, monkeypatch
    ):
        token = await self._get_token(async_client, test_user.email, monkeypatch)
        r = await async_client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "BrandNew@123"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["success"] is True

        # Logging in with the new password should succeed.
        login = await async_client.post(
            "/api/v1/auth/login",
            json={"email": test_user.email, "password": "BrandNew@123"},
        )
        assert login.status_code == 200
        assert login.json()["success"] is True

    async def test_old_password_no_longer_works_after_reset(
        self, async_client, test_user, monkeypatch
    ):
        token = await self._get_token(async_client, test_user.email, monkeypatch)
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
        self, async_client, test_user, monkeypatch
    ):
        token = await self._get_token(async_client, test_user.email, monkeypatch)
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
