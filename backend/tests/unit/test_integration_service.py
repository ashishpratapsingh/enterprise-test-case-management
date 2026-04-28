"""Unit tests for the JIRA portion of IntegrationService.

We avoid real network calls by patching ``httpx.AsyncClient`` to use a
``MockTransport``. Each test wires up a transport function that asserts
on the outgoing request (URL, headers, body) and returns a canned
response, then exercises the service method end-to-end.
"""

from __future__ import annotations

import base64
from typing import Any
from unittest.mock import patch

import httpx
import pytest

from app.core.config import Settings
from app.core.exceptions import IntegrationError, ValidationError
from app.services.integration_service import IntegrationService


def _settings(**overrides: Any) -> Settings:
    base = {
        "DEBUG": True,
        "SECRET_KEY": "a" * 64,
    }
    base.update(overrides)
    return Settings(_env_file=None, **base)


def _build_service(settings: Settings) -> IntegrationService:
    """Construct an IntegrationService with stub settings.

    The DB session is unused by the JIRA codepath so ``None`` is safe;
    we cast to suppress the type hint mismatch.
    """
    svc = IntegrationService(session=None)  # type: ignore[arg-type]
    svc.settings = settings
    return svc


def _mock_client_factory(transport: httpx.MockTransport):
    """Return a substitute for ``httpx.AsyncClient`` that always uses
    the given MockTransport. Used as a target for ``patch.object`` so
    each test can swap in its own canned responses."""

    class _Client(httpx.AsyncClient):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            kwargs.pop("transport", None)
            super().__init__(*args, transport=transport, **kwargs)

    return _Client


# ── _ensure_jira_configured ────────────────────────────────────────────────


class TestEnsureJiraConfigured:
    def test_raises_when_base_url_missing(self):
        svc = _build_service(_settings(JIRA_BASE_URL=None, JIRA_API_TOKEN="t"))
        with pytest.raises(ValidationError, match="JIRA integration is not configured"):
            svc._ensure_jira_configured()

    def test_raises_when_token_missing(self):
        svc = _build_service(
            _settings(JIRA_BASE_URL="https://x.atlassian.net", JIRA_API_TOKEN=None)
        )
        with pytest.raises(ValidationError):
            svc._ensure_jira_configured()

    def test_passes_when_both_set(self):
        svc = _build_service(
            _settings(JIRA_BASE_URL="https://x.atlassian.net", JIRA_API_TOKEN="t")
        )
        # Should not raise.
        svc._ensure_jira_configured()


# ── _jira_headers (Cloud vs Server auth) ───────────────────────────────────


class TestJiraHeaders:
    def test_cloud_uses_basic_auth_with_email_and_token(self):
        svc = _build_service(
            _settings(
                JIRA_BASE_URL="https://x.atlassian.net",
                JIRA_USER_EMAIL="me@example.com",
                JIRA_API_TOKEN="secret",
            )
        )
        headers = svc._jira_headers()
        expected = base64.b64encode(b"me@example.com:secret").decode("ascii")
        assert headers["Authorization"] == f"Basic {expected}"
        assert headers["Accept"] == "application/json"
        assert headers["Content-Type"] == "application/json"

    def test_server_uses_bearer_when_email_blank(self):
        svc = _build_service(
            _settings(
                JIRA_BASE_URL="https://jira.internal",
                JIRA_USER_EMAIL=None,
                JIRA_API_TOKEN="opaque-pat",
            )
        )
        headers = svc._jira_headers()
        assert headers["Authorization"] == "Bearer opaque-pat"


# ── jira_browse_url ────────────────────────────────────────────────────────


class TestBrowseUrl:
    def test_builds_url_from_base(self):
        svc = _build_service(_settings(JIRA_BASE_URL="https://x.atlassian.net"))
        assert svc.jira_browse_url("PRJ-1") == "https://x.atlassian.net/browse/PRJ-1"

    def test_strips_trailing_slash(self):
        svc = _build_service(_settings(JIRA_BASE_URL="https://x.atlassian.net/"))
        assert svc.jira_browse_url("PRJ-1") == "https://x.atlassian.net/browse/PRJ-1"

    def test_returns_empty_when_unconfigured(self):
        svc = _build_service(_settings(JIRA_BASE_URL=None))
        assert svc.jira_browse_url("PRJ-1") == ""

    def test_returns_empty_when_key_blank(self):
        svc = _build_service(_settings(JIRA_BASE_URL="https://x.atlassian.net"))
        assert svc.jira_browse_url("") == ""


# ── jira_create_issue ──────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestJiraCreateIssue:
    async def test_posts_expected_payload_and_returns_trimmed_response(self):
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["method"] = request.method
            captured["headers"] = dict(request.headers)
            captured["json"] = request.read().decode("utf-8")
            return httpx.Response(
                201,
                json={
                    "id": "10001",
                    "key": "PRJ-42",
                    "self": "https://x.atlassian.net/rest/api/2/issue/10001",
                },
            )

        transport = httpx.MockTransport(handler)
        svc = _build_service(
            _settings(
                JIRA_BASE_URL="https://x.atlassian.net",
                JIRA_USER_EMAIL="me@example.com",
                JIRA_API_TOKEN="secret",
            )
        )
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            issue = await svc.jira_create_issue(
                project_key="PRJ",
                summary="Login button broken",
                description="repro steps",
                issue_type="Bug",
            )

        assert captured["method"] == "POST"
        assert captured["url"] == "https://x.atlassian.net/rest/api/2/issue"
        assert captured["headers"]["authorization"].startswith("Basic ")

        import json
        body = json.loads(captured["json"])
        assert body == {
            "fields": {
                "project": {"key": "PRJ"},
                "summary": "Login button broken",
                "description": "repro steps",
                "issuetype": {"name": "Bug"},
            }
        }

        assert issue["key"] == "PRJ-42"
        assert issue["id"] == "10001"
        assert issue["url"] == "https://x.atlassian.net/browse/PRJ-42"

    async def test_missing_project_key_raises_validation_error(self):
        svc = _build_service(
            _settings(JIRA_BASE_URL="https://x.atlassian.net", JIRA_API_TOKEN="t")
        )
        with pytest.raises(ValidationError):
            await svc.jira_create_issue(
                project_key="", summary="x", description=""
            )

    async def test_upstream_error_raises_integration_error_without_leaking_body(self):
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                401,
                json={"errorMessages": ["bad token: secret-leak-bait"]},
            )

        transport = httpx.MockTransport(handler)
        svc = _build_service(
            _settings(JIRA_BASE_URL="https://x.atlassian.net", JIRA_API_TOKEN="t")
        )
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            with pytest.raises(IntegrationError) as exc_info:
                await svc.jira_create_issue(
                    project_key="PRJ", summary="x", description=""
                )

        # Status echoed but upstream body must not be leaked back.
        assert "401" in str(exc_info.value.message)
        assert "secret-leak-bait" not in str(exc_info.value.message)

    async def test_transport_failure_raises_integration_error(self):
        def handler(_request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("name resolution failed")

        transport = httpx.MockTransport(handler)
        svc = _build_service(
            _settings(JIRA_BASE_URL="https://x.atlassian.net", JIRA_API_TOKEN="t")
        )
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            with pytest.raises(IntegrationError, match="Could not reach JIRA"):
                await svc.jira_create_issue(
                    project_key="PRJ", summary="x", description=""
                )


# ── jira_get_issue ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
class TestJiraGetIssue:
    async def test_returns_trimmed_fields(self):
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.method == "GET"
            assert str(request.url).endswith("/rest/api/2/issue/PRJ-1")
            return httpx.Response(
                200,
                json={
                    "id": "10001",
                    "key": "PRJ-1",
                    "fields": {
                        "summary": "Login broken",
                        "status": {"name": "In Progress"},
                        "assignee": {"displayName": "Alice"},
                        "issuetype": {"name": "Bug"},
                        "description": "ignored",
                    },
                },
            )

        transport = httpx.MockTransport(handler)
        svc = _build_service(
            _settings(JIRA_BASE_URL="https://x.atlassian.net", JIRA_API_TOKEN="t")
        )
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            issue = await svc.jira_get_issue("PRJ-1")

        assert issue == {
            "key": "PRJ-1",
            "id": "10001",
            "summary": "Login broken",
            "status": "In Progress",
            "assignee": "Alice",
            "issue_type": "Bug",
            "url": "https://x.atlassian.net/browse/PRJ-1",
        }

    async def test_handles_missing_assignee_and_status_gracefully(self):
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "id": "1",
                    "key": "PRJ-1",
                    "fields": {"summary": "x"},
                },
            )

        transport = httpx.MockTransport(handler)
        svc = _build_service(
            _settings(JIRA_BASE_URL="https://x.atlassian.net", JIRA_API_TOKEN="t")
        )
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            issue = await svc.jira_get_issue("PRJ-1")

        assert issue["status"] is None
        assert issue["assignee"] is None
        assert issue["issue_type"] is None

    async def test_404_from_jira_raises_integration_error(self):
        def handler(_request: httpx.Request) -> httpx.Response:
            return httpx.Response(404, json={"errorMessages": ["Issue does not exist"]})

        transport = httpx.MockTransport(handler)
        svc = _build_service(
            _settings(JIRA_BASE_URL="https://x.atlassian.net", JIRA_API_TOKEN="t")
        )
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            with pytest.raises(IntegrationError):
                await svc.jira_get_issue("PRJ-999")
