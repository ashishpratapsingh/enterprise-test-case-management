"""Integration tests for /api/v1/auth/sso/* OIDC routes.

httpx is patched so we never reach a real IdP — the MockTransport
fakes the discovery, token, and userinfo endpoints. OIDC settings
are mutated on the cached Settings singleton via monkeypatch.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app.core.config import get_settings

pytestmark = pytest.mark.asyncio


def _mock_client_factory(transport: httpx.MockTransport):
    class _Client(httpx.AsyncClient):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            kwargs.pop("transport", None)
            super().__init__(*args, transport=transport, **kwargs)

    return _Client


@pytest.fixture
def sso_configured(monkeypatch):
    """Wire OIDC settings + clear the discovery cache so a stale
    cached doc from a previous test doesn't bleed in."""
    s = get_settings()
    monkeypatch.setattr(s, "OIDC_DISCOVERY_URL", "https://idp.example.com/.well-known/openid-configuration")
    monkeypatch.setattr(s, "OIDC_CLIENT_ID", "test-client")
    monkeypatch.setattr(s, "OIDC_CLIENT_SECRET", "test-secret")
    monkeypatch.setattr(s, "OIDC_SCOPES", "openid email profile")
    monkeypatch.setattr(s, "OIDC_REDIRECT_URI", "http://test.example/api/v1/auth/sso/callback")
    monkeypatch.setattr(s, "OIDC_PROVIDER_NAME", "TestSSO")
    monkeypatch.setattr(s, "OIDC_DEFAULT_ROLE_NAME", "Admin")  # matches the test_role fixture
    # Clear the process-wide discovery cache so each test gets a
    # fresh fetch through the MockTransport.
    from app.services.sso_service import SSOService
    SSOService._discovery_cache.clear()
    return s


def _idp_handler(*, userinfo: dict[str, Any] | None = None,
                 token: dict[str, Any] | None = None,
                 fail_userinfo: bool = False):
    """Build an httpx mock that fakes a tiny but valid OIDC IdP."""
    discovery_doc = {
        "authorization_endpoint": "https://idp.example.com/oauth/authorize",
        "token_endpoint": "https://idp.example.com/oauth/token",
        "userinfo_endpoint": "https://idp.example.com/userinfo",
        "issuer": "https://idp.example.com",
    }
    token_resp = token or {
        "access_token": "fake-access-token",
        "token_type": "Bearer",
        "expires_in": 3600,
        "id_token": "ignored-in-v1",
    }
    userinfo_resp = userinfo or {
        "sub": "abc-123",
        "email": "alice@example.com",
        "email_verified": True,
        "name": "Alice Example",
    }

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "/.well-known/openid-configuration" in url:
            return httpx.Response(200, json=discovery_doc)
        if "/oauth/token" in url:
            return httpx.Response(200, json=token_resp)
        if "/userinfo" in url:
            if fail_userinfo:
                return httpx.Response(401, json={"error": "invalid_token"})
            return httpx.Response(200, json=userinfo_resp)
        return httpx.Response(404, json={"error": "unmocked"})

    return handler


# ── /auth/sso/config ───────────────────────────────────────────────────────


class TestSSOConfig:
    async def test_returns_disabled_when_not_configured(
        self, async_client, monkeypatch
    ):
        s = get_settings()
        monkeypatch.setattr(s, "OIDC_DISCOVERY_URL", None)
        monkeypatch.setattr(s, "OIDC_CLIENT_ID", None)
        monkeypatch.setattr(s, "OIDC_CLIENT_SECRET", None)

        r = await async_client.get("/api/v1/auth/sso/config")
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["enabled"] is False

    async def test_returns_enabled_with_provider_name(
        self, async_client, sso_configured
    ):
        r = await async_client.get("/api/v1/auth/sso/config")
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["enabled"] is True
        assert data["provider_name"] == "TestSSO"
        assert data["login_url"] == "/api/v1/auth/sso/login"


# ── /auth/sso/login ────────────────────────────────────────────────────────


class TestSSOLogin:
    async def test_redirects_to_idp_with_state(
        self, async_client, sso_configured
    ):
        transport = httpx.MockTransport(_idp_handler())
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.get(
                "/api/v1/auth/sso/login", follow_redirects=False
            )
        assert r.status_code == 307
        location = r.headers["location"]
        parsed = urlparse(location)
        assert parsed.scheme == "https"
        assert parsed.netloc == "idp.example.com"
        assert parsed.path == "/oauth/authorize"
        params = parse_qs(parsed.query)
        assert params["response_type"] == ["code"]
        assert params["client_id"] == ["test-client"]
        assert params["redirect_uri"] == ["http://test.example/api/v1/auth/sso/callback"]
        assert "openid" in params["scope"][0]
        assert params["state"][0]  # state JWT is non-empty

    async def test_unconfigured_returns_422(
        self, async_client, monkeypatch
    ):
        s = get_settings()
        monkeypatch.setattr(s, "OIDC_DISCOVERY_URL", None)
        monkeypatch.setattr(s, "OIDC_CLIENT_ID", None)
        monkeypatch.setattr(s, "OIDC_CLIENT_SECRET", None)
        r = await async_client.get(
            "/api/v1/auth/sso/login", follow_redirects=False
        )
        assert r.status_code == 422


# ── /auth/sso/callback ─────────────────────────────────────────────────────


async def _capture_state(async_client, sso_configured, return_to: str | None = None):
    """Drive /sso/login through the mocked discovery and pull the
    signed state out of the redirect URL so we can replay it on the
    callback."""
    transport = httpx.MockTransport(_idp_handler())
    with patch("httpx.AsyncClient", _mock_client_factory(transport)):
        params = {"return_to": return_to} if return_to else None
        r = await async_client.get(
            "/api/v1/auth/sso/login", params=params, follow_redirects=False
        )
    parsed = urlparse(r.headers["location"])
    return parse_qs(parsed.query)["state"][0]


class TestSSOCallback:
    async def test_happy_path_provisions_user_and_redirects_with_tokens(
        self, async_client, sso_configured, test_role
    ):
        state = await _capture_state(async_client, sso_configured)

        transport = httpx.MockTransport(_idp_handler())
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.get(
                "/api/v1/auth/sso/callback",
                params={"code": "valid-code", "state": state},
                follow_redirects=False,
            )
        assert r.status_code == 307
        location = r.headers["location"]
        # Tokens land in the URL fragment, not the query string —
        # keeps them out of server logs and Referer headers.
        assert "#" in location
        fragment = location.split("#", 1)[1]
        params = parse_qs(fragment)
        assert params["access_token"][0]
        assert params["refresh_token"][0]
        assert params["user_id"][0]

        # Verify the new user actually landed in the DB.
        from sqlalchemy import select
        from app.models.user import User
        # The async_client overrides get_db with the test session, but
        # for verification we open a fresh select against the test
        # session via a dedicated route.
        whoami = await async_client.get(
            "/api/v1/users/me",
            headers={"Authorization": f"Bearer {params['access_token'][0]}"},
        )
        assert whoami.status_code == 200, whoami.text
        assert whoami.json()["data"]["email"] == "alice@example.com"

    async def test_invalid_state_is_rejected(
        self, async_client, sso_configured
    ):
        # Don't go through /sso/login — supply a hand-crafted (and
        # unsigned) state to confirm CSRF protection bites.
        transport = httpx.MockTransport(_idp_handler())
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.get(
                "/api/v1/auth/sso/callback",
                params={"code": "valid-code", "state": "not-a-jwt"},
                follow_redirects=False,
            )
        # Errors become a redirect to /sso/callback?error=… so the UI
        # can show a friendly message.
        assert r.status_code == 307
        assert "error=" in r.headers["location"]

    async def test_idp_returned_error_short_circuits(
        self, async_client, sso_configured
    ):
        r = await async_client.get(
            "/api/v1/auth/sso/callback",
            params={"error": "access_denied", "error_description": "User clicked cancel"},
            follow_redirects=False,
        )
        assert r.status_code == 307
        loc = r.headers["location"]
        assert "/sso/callback?error=" in loc
        assert "User%20clicked%20cancel" in loc

    async def test_userinfo_without_email_is_rejected(
        self, async_client, sso_configured
    ):
        state = await _capture_state(async_client, sso_configured)
        transport = httpx.MockTransport(_idp_handler(userinfo={"sub": "x", "name": "No Email"}))
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.get(
                "/api/v1/auth/sso/callback",
                params={"code": "valid-code", "state": state},
                follow_redirects=False,
            )
        assert r.status_code == 307
        assert "error=" in r.headers["location"]
        # Surface the actual reason in the URL so the UI can render it.
        assert "email" in r.headers["location"].lower()

    async def test_existing_user_matched_by_email(
        self, async_client, sso_configured, test_user
    ):
        # OIDC returns the existing user's email — should NOT create
        # a new row, just log them in.
        state = await _capture_state(async_client, sso_configured)
        transport = httpx.MockTransport(_idp_handler(userinfo={
            "sub": "from-idp",
            "email": test_user.email,
            "name": "From IdP",
        }))
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.get(
                "/api/v1/auth/sso/callback",
                params={"code": "valid-code", "state": state},
                follow_redirects=False,
            )
        assert r.status_code == 307
        fragment = r.headers["location"].split("#", 1)[1]
        params = parse_qs(fragment)
        # The matched user_id is the existing test_user, not a fresh row.
        assert params["user_id"][0] == str(test_user.id)

    async def test_provisioning_fails_when_default_role_missing(
        self, async_client, sso_configured, monkeypatch
    ):
        # Aim auto-provisioning at a non-existent role.
        s = get_settings()
        monkeypatch.setattr(s, "OIDC_DEFAULT_ROLE_NAME", "NoSuchRole")
        state = await _capture_state(async_client, sso_configured)
        transport = httpx.MockTransport(_idp_handler())
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.get(
                "/api/v1/auth/sso/callback",
                params={"code": "valid-code", "state": state},
                follow_redirects=False,
            )
        assert r.status_code == 307
        assert "error=" in r.headers["location"]
        assert "nosuchrole" in r.headers["location"].lower()

    async def test_provisioning_disabled_rejects_new_users(
        self, async_client, sso_configured, monkeypatch
    ):
        s = get_settings()
        monkeypatch.setattr(s, "OIDC_DEFAULT_ROLE_NAME", "")
        state = await _capture_state(async_client, sso_configured)
        transport = httpx.MockTransport(_idp_handler())
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.get(
                "/api/v1/auth/sso/callback",
                params={"code": "valid-code", "state": state},
                follow_redirects=False,
            )
        assert r.status_code == 307
        assert "error=" in r.headers["location"]
        assert "auto-provisioning" in r.headers["location"].lower()
