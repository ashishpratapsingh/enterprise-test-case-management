"""Integration tests for /api/v1/integrations/jira routes.

httpx.AsyncClient is patched per-test so we never hit real JIRA — each
test injects a MockTransport that asserts on the outgoing request and
returns canned data. JIRA settings are mutated on the cached Settings
singleton via monkeypatch (auto-restored by pytest after each test).
"""

from __future__ import annotations

from typing import Any
from unittest.mock import patch

import httpx
import pytest

from app.core.config import get_settings

pytestmark = pytest.mark.asyncio


# ── Helpers ────────────────────────────────────────────────────────────────


def _mock_client_factory(transport: httpx.MockTransport):
    class _Client(httpx.AsyncClient):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            kwargs.pop("transport", None)
            super().__init__(*args, transport=transport, **kwargs)

    return _Client


@pytest.fixture
def jira_configured(monkeypatch):
    """Populate JIRA settings on the cached Settings singleton.

    monkeypatch.setattr restores the previous values after the test, so
    other tests that run with JIRA unconfigured still see the defaults.
    """
    s = get_settings()
    monkeypatch.setattr(s, "JIRA_BASE_URL", "https://x.atlassian.net")
    monkeypatch.setattr(s, "JIRA_USER_EMAIL", "qa@example.com")
    monkeypatch.setattr(s, "JIRA_API_TOKEN", "test-token")
    return s


async def _create_defect(async_client, auth_headers, project) -> str:
    r = await async_client.post(
        "/api/v1/defects",
        headers=auth_headers,
        json={
            "title": "JIRA-link-bug",
            "project_id": project.id,
            "severity": "Medium",
            "priority": "Medium",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


# ── Auth + config guards ───────────────────────────────────────────────────


class TestAuthAndConfig:
    async def test_requires_auth(self, async_client):
        r = await async_client.get("/api/v1/integrations/jira/issues/PRJ-1")
        # 422 from FastAPI's missing-required-header check; 401 if a malformed
        # header sneaks through. Either is "rejected before reaching JIRA".
        assert r.status_code in (401, 422)

    async def test_returns_422_when_jira_not_configured(
        self, async_client, auth_headers, monkeypatch
    ):
        s = get_settings()
        monkeypatch.setattr(s, "JIRA_BASE_URL", None)
        monkeypatch.setattr(s, "JIRA_API_TOKEN", None)

        r = await async_client.get(
            "/api/v1/integrations/jira/issues/PRJ-1", headers=auth_headers
        )
        assert r.status_code == 422
        assert "not configured" in r.json()["message"]


# ── GET /integrations/jira/issues/{key} ────────────────────────────────────


class TestGetJiraIssue:
    async def test_returns_trimmed_issue(
        self, async_client, auth_headers, jira_configured
    ):
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.method == "GET"
            assert str(request.url).endswith("/rest/api/2/issue/PRJ-7")
            return httpx.Response(
                200,
                json={
                    "id": "1001",
                    "key": "PRJ-7",
                    "fields": {
                        "summary": "Crash on logout",
                        "status": {"name": "Open"},
                        "assignee": {"displayName": "Bob"},
                        "issuetype": {"name": "Bug"},
                    },
                },
            )

        transport = httpx.MockTransport(handler)
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.get(
                "/api/v1/integrations/jira/issues/PRJ-7", headers=auth_headers
            )

        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["key"] == "PRJ-7"
        assert data["summary"] == "Crash on logout"
        assert data["status"] == "Open"
        assert data["assignee"] == "Bob"
        assert data["url"] == "https://x.atlassian.net/browse/PRJ-7"

    async def test_upstream_failure_returns_502(
        self, async_client, auth_headers, jira_configured
    ):
        transport = httpx.MockTransport(
            lambda _r: httpx.Response(500, json={"errorMessages": ["boom"]})
        )
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.get(
                "/api/v1/integrations/jira/issues/PRJ-1", headers=auth_headers
            )
        assert r.status_code == 502


# ── POST /integrations/jira/issues ─────────────────────────────────────────


class TestCreateJiraIssue:
    async def test_creates_issue_without_link(
        self, async_client, auth_headers, jira_configured
    ):
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.method == "POST"
            return httpx.Response(
                201,
                json={
                    "id": "10001",
                    "key": "PRJ-99",
                    "self": "https://x.atlassian.net/rest/api/2/issue/10001",
                },
            )

        transport = httpx.MockTransport(handler)
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.post(
                "/api/v1/integrations/jira/issues",
                headers=auth_headers,
                json={
                    "project_key": "PRJ",
                    "summary": "Smoke test ticket",
                    "description": "from automated suite",
                    "issue_type": "Bug",
                },
            )

        assert r.status_code == 201, r.text
        data = r.json()["data"]
        assert data["key"] == "PRJ-99"
        assert data["url"] == "https://x.atlassian.net/browse/PRJ-99"
        assert data["linked_to"] is None

    async def test_creates_and_links_to_defect(
        self, async_client, auth_headers, test_project, jira_configured
    ):
        defect_id = await _create_defect(async_client, auth_headers, test_project)

        transport = httpx.MockTransport(
            lambda _r: httpx.Response(
                201,
                json={
                    "id": "1",
                    "key": "PRJ-1",
                    "self": "https://x.atlassian.net/rest/api/2/issue/1",
                },
            )
        )
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.post(
                "/api/v1/integrations/jira/issues",
                headers=auth_headers,
                json={
                    "project_key": "PRJ",
                    "summary": "Linked",
                    "defect_id": defect_id,
                },
            )

        assert r.status_code == 201, r.text
        body = r.json()
        assert body["data"]["linked_to"] == f"defect:{defect_id}"
        assert "linked to" in body["message"]

        # Defect now carries the JIRA key.
        view = await async_client.get(
            f"/api/v1/defects/{defect_id}", headers=auth_headers
        )
        assert view.status_code == 200
        assert view.json()["data"]["jira_ticket_id"] == "PRJ-1"

    async def test_link_to_unknown_defect_returns_404(
        self, async_client, auth_headers, jira_configured
    ):
        transport = httpx.MockTransport(
            lambda _r: httpx.Response(
                201,
                json={"id": "1", "key": "PRJ-1", "self": ""},
            )
        )
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.post(
                "/api/v1/integrations/jira/issues",
                headers=auth_headers,
                json={
                    "project_key": "PRJ",
                    "summary": "ghost",
                    "defect_id": "00000000-0000-0000-0000-000000000000",
                },
            )
        assert r.status_code == 404

    async def test_payload_validation_rejects_blank_summary(
        self, async_client, auth_headers, jira_configured
    ):
        r = await async_client.post(
            "/api/v1/integrations/jira/issues",
            headers=auth_headers,
            json={"project_key": "PRJ", "summary": ""},
        )
        assert r.status_code == 422


# ── CI ingest helpers ──────────────────────────────────────────────────────


async def _create_suite(async_client, auth_headers, project) -> str:
    r = await async_client.post(
        "/api/v1/testsuites",
        headers=auth_headers,
        json={"name": "CI suite", "project_id": project.id},
    )
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


async def _create_test_case(
    async_client, auth_headers, project, **overrides
) -> dict:
    body = {
        "title": overrides.get("title", "CI tc"),
        "project_id": project.id,
        "priority": overrides.get("priority", "Medium"),
    }
    body.update({k: v for k, v in overrides.items() if k not in body})
    r = await async_client.post("/api/v1/testcases", headers=auth_headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()["data"]


# ── /integrations/ci/results ───────────────────────────────────────────────


class TestCIIngest:
    async def test_happy_path_creates_run_and_executions(
        self, async_client, auth_headers, test_project
    ):
        suite_id = await _create_suite(async_client, auth_headers, test_project)
        tc1 = await _create_test_case(async_client, auth_headers, test_project, title="login")
        tc2 = await _create_test_case(async_client, auth_headers, test_project, title="logout")

        r = await async_client.post(
            "/api/v1/integrations/ci/results",
            headers=auth_headers,
            json={
                "project_id": test_project.id,
                "test_suite_id": suite_id,
                "run_name": "Build #42",
                "environment": "Chrome 120 / staging",
                "started_at": "2026-04-28T10:00:00Z",
                "completed_at": "2026-04-28T10:00:30Z",
                "results": [
                    {
                        "test_case_id": tc1["test_case_id"],
                        "status": "passed",
                        "duration_seconds": 1.4,
                    },
                    {
                        "test_case_id": tc2["test_case_id"],
                        "status": "FAILED",
                        "duration_seconds": 2.1,
                        "error_message": "AssertionError: button not found",
                    },
                ],
            },
        )
        assert r.status_code == 201, r.text
        data = r.json()["data"]
        assert sorted(data["succeeded"]) == sorted([tc1["test_case_id"], tc2["test_case_id"]])
        assert data["failed"] == []
        assert data["status"] == "Completed"

        # Confirm executions exist with the mapped statuses.
        execs = await async_client.get(
            f"/api/v1/testruns/{data['test_run_id']}/executions",
            headers=auth_headers,
        )
        assert execs.status_code == 200
        items = execs.json()["data"]
        # The endpoint may return either a list or a (list, total) tuple
        # depending on the route shape — handle both.
        rows = items[0] if isinstance(items, list) and len(items) == 2 and isinstance(items[0], list) else items
        statuses = {row["test_case_id"]: row["status"] for row in rows}
        assert statuses[tc1["id"]] == "Pass"
        assert statuses[tc2["id"]] == "Fail"

    async def test_unknown_test_case_id_reported_not_raised(
        self, async_client, auth_headers, test_project
    ):
        suite_id = await _create_suite(async_client, auth_headers, test_project)
        tc1 = await _create_test_case(async_client, auth_headers, test_project, title="ok")

        r = await async_client.post(
            "/api/v1/integrations/ci/results",
            headers=auth_headers,
            json={
                "project_id": test_project.id,
                "test_suite_id": suite_id,
                "run_name": "Build #43",
                "results": [
                    {"test_case_id": tc1["test_case_id"], "status": "pass"},
                    {"test_case_id": "TC-GHOST-9999", "status": "fail"},
                ],
            },
        )
        assert r.status_code == 201, r.text
        data = r.json()["data"]
        assert data["succeeded"] == [tc1["test_case_id"]]
        assert len(data["failed"]) == 1
        assert data["failed"][0]["test_case_id"] == "TC-GHOST-9999"
        assert "not found" in data["failed"][0]["error"].lower()

    async def test_unrecognised_status_reported(
        self, async_client, auth_headers, test_project
    ):
        suite_id = await _create_suite(async_client, auth_headers, test_project)
        tc1 = await _create_test_case(async_client, auth_headers, test_project, title="x")
        r = await async_client.post(
            "/api/v1/integrations/ci/results",
            headers=auth_headers,
            json={
                "project_id": test_project.id,
                "test_suite_id": suite_id,
                "run_name": "Build #44",
                "results": [
                    {"test_case_id": tc1["test_case_id"], "status": "wibble"},
                ],
            },
        )
        assert r.status_code == 201
        data = r.json()["data"]
        assert data["succeeded"] == []
        assert len(data["failed"]) == 1
        assert "unrecognised status" in data["failed"][0]["error"].lower()

    async def test_status_mapping_covers_short_and_long_forms(
        self, async_client, auth_headers, test_project
    ):
        suite_id = await _create_suite(async_client, auth_headers, test_project)
        tcs = {}
        for label in ("p", "f", "s", "b"):
            tcs[label] = await _create_test_case(async_client, auth_headers, test_project, title=label)
        r = await async_client.post(
            "/api/v1/integrations/ci/results",
            headers=auth_headers,
            json={
                "project_id": test_project.id,
                "test_suite_id": suite_id,
                "run_name": "mapping",
                "results": [
                    {"test_case_id": tcs["p"]["test_case_id"], "status": "pass"},
                    {"test_case_id": tcs["f"]["test_case_id"], "status": "FAIL"},
                    {"test_case_id": tcs["s"]["test_case_id"], "status": "Skipped"},
                    {"test_case_id": tcs["b"]["test_case_id"], "status": "blocked"},
                ],
            },
        )
        assert r.status_code == 201
        assert len(r.json()["data"]["succeeded"]) == 4

    async def test_suite_must_belong_to_project(
        self, async_client, auth_headers, test_project, db_session
    ):
        """A suite from project A submitted with project B's id is
        rejected — defends against accidentally mixing projects'
        results into a single run."""
        # Build a SECOND project + suite.
        from app.models.project import Project
        import uuid as _uuid
        p2 = Project(
            id=str(_uuid.uuid4()),
            name="OtherProj",
            code="OP",
            description="",
            is_active=True,
            created_by=test_project.created_by,
        )
        db_session.add(p2)
        await db_session.flush()
        # Create a suite under p2 via the API.
        s2_resp = await async_client.post(
            "/api/v1/testsuites",
            headers=auth_headers,
            json={"name": "p2 suite", "project_id": p2.id},
        )
        assert s2_resp.status_code == 201
        s2_id = s2_resp.json()["data"]["id"]

        r = await async_client.post(
            "/api/v1/integrations/ci/results",
            headers=auth_headers,
            json={
                "project_id": test_project.id,  # WRONG project
                "test_suite_id": s2_id,
                "run_name": "x",
                "results": [{"test_case_id": "TC-X-1", "status": "pass"}],
            },
        )
        assert r.status_code == 422
        assert "does not belong" in r.json()["message"]

    async def test_unknown_project_returns_404(
        self, async_client, auth_headers
    ):
        r = await async_client.post(
            "/api/v1/integrations/ci/results",
            headers=auth_headers,
            json={
                "project_id": "00000000-0000-0000-0000-000000000000",
                "test_suite_id": "00000000-0000-0000-0000-000000000000",
                "run_name": "x",
                "results": [{"test_case_id": "TC-X-1", "status": "pass"}],
            },
        )
        assert r.status_code == 404

    async def test_empty_results_rejected(
        self, async_client, auth_headers, test_project
    ):
        suite_id = await _create_suite(async_client, auth_headers, test_project)
        r = await async_client.post(
            "/api/v1/integrations/ci/results",
            headers=auth_headers,
            json={
                "project_id": test_project.id,
                "test_suite_id": suite_id,
                "run_name": "x",
                "results": [],
            },
        )
        assert r.status_code == 422


# ── /integrations/github/* ─────────────────────────────────────────────────


@pytest.fixture
def github_configured(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "GITHUB_BASE_URL", None)  # default api.github.com
    monkeypatch.setattr(s, "GITHUB_TOKEN", "ghp_test_token")
    monkeypatch.setattr(s, "GITHUB_DEFAULT_REPO", "acme/widgets")
    return s


class TestGithubConfig:
    async def test_returns_configured_flag_and_default_repo(
        self, async_client, auth_headers, github_configured
    ):
        r = await async_client.get(
            "/api/v1/integrations/github/config", headers=auth_headers
        )
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["configured"] is True
        assert data["default_repo"] == "acme/widgets"

    async def test_unconfigured_state(
        self, async_client, auth_headers, monkeypatch
    ):
        s = get_settings()
        monkeypatch.setattr(s, "GITHUB_TOKEN", None)
        monkeypatch.setattr(s, "GITHUB_DEFAULT_REPO", None)
        r = await async_client.get(
            "/api/v1/integrations/github/config", headers=auth_headers
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert data["configured"] is False
        assert data["default_repo"] == ""


class TestGithubListCommits:
    async def test_returns_trimmed_records(
        self, async_client, auth_headers, github_configured
    ):
        captured: dict[str, Any] = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["headers"] = dict(request.headers)
            return httpx.Response(
                200,
                json=[
                    {
                        "sha": "abc123def4567890",
                        "html_url": "https://github.com/acme/widgets/commit/abc123def4567890",
                        "commit": {
                            "message": "Fix login bug\n\nLong body explaining the fix",
                            "author": {
                                "name": "Alice",
                                "email": "alice@example.com",
                                "date": "2026-04-28T10:00:00Z",
                            },
                        },
                        "author": {
                            "login": "alice",
                            "avatar_url": "https://avatars.githubusercontent.com/u/1",
                        },
                    },
                ],
            )

        transport = httpx.MockTransport(handler)
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.get(
                "/api/v1/integrations/github/commits",
                params={"repo": "acme/widgets", "branch": "main", "per_page": 5},
                headers=auth_headers,
            )

        assert r.status_code == 200, r.text
        assert "api.github.com/repos/acme/widgets/commits" in captured["url"]
        assert "sha=main" in captured["url"]
        assert "per_page=5" in captured["url"]
        assert captured["headers"]["authorization"].startswith("Bearer ")

        commits = r.json()["data"]
        assert len(commits) == 1
        c = commits[0]
        assert c["sha"] == "abc123def4567890"
        assert c["short_sha"] == "abc123d"
        # First line only, trimmed.
        assert c["message"] == "Fix login bug"
        assert c["author_login"] == "alice"
        assert c["url"].endswith("/commit/abc123def4567890")

    async def test_unconfigured_returns_422(
        self, async_client, auth_headers, monkeypatch
    ):
        s = get_settings()
        monkeypatch.setattr(s, "GITHUB_TOKEN", None)
        r = await async_client.get(
            "/api/v1/integrations/github/commits",
            params={"repo": "acme/widgets"},
            headers=auth_headers,
        )
        assert r.status_code == 422
        assert "not configured" in r.json()["message"].lower()

    async def test_invalid_repo_slug_rejected(
        self, async_client, auth_headers, github_configured
    ):
        r = await async_client.get(
            "/api/v1/integrations/github/commits",
            params={"repo": "no-slash"},
            headers=auth_headers,
        )
        assert r.status_code == 422

    async def test_upstream_failure_returns_502_without_leaking(
        self, async_client, auth_headers, github_configured
    ):
        transport = httpx.MockTransport(
            lambda _r: httpx.Response(
                401,
                json={"message": "bad token: secret-leak-bait"},
            )
        )
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.get(
                "/api/v1/integrations/github/commits",
                params={"repo": "acme/widgets"},
                headers=auth_headers,
            )
        assert r.status_code == 502
        assert "401" in r.json()["message"]
        assert "secret-leak-bait" not in r.json()["message"]


class TestGithubGetCommit:
    async def test_includes_diff_stats(
        self, async_client, auth_headers, github_configured
    ):
        def handler(_r: httpx.Request) -> httpx.Response:
            return httpx.Response(
                200,
                json={
                    "sha": "deadbeef0000111122223333444455556666",
                    "html_url": "https://github.com/acme/widgets/commit/deadbeef",
                    "commit": {
                        "message": "Refactor foo",
                        "author": {"name": "Bob", "email": "bob@example.com", "date": "2026-04-28T11:00:00Z"},
                    },
                    "author": {"login": "bob"},
                    "files": [{"filename": "a.py"}, {"filename": "b.py"}],
                    "stats": {"additions": 12, "deletions": 3},
                },
            )

        transport = httpx.MockTransport(handler)
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.get(
                "/api/v1/integrations/github/commits/deadbeef",
                params={"repo": "acme/widgets"},
                headers=auth_headers,
            )
        assert r.status_code == 200, r.text
        c = r.json()["data"]
        assert c["files_changed"] == 2
        assert c["additions"] == 12
        assert c["deletions"] == 3


class TestGithubListPulls:
    async def test_returns_trimmed_pulls(
        self, async_client, auth_headers, github_configured
    ):
        def handler(request: httpx.Request) -> httpx.Response:
            assert "state=closed" in str(request.url)
            return httpx.Response(
                200,
                json=[
                    {
                        "number": 42,
                        "title": "Add CI ingest",
                        "state": "closed",
                        "merged_at": "2026-04-25T10:00:00Z",
                        "draft": False,
                        "user": {"login": "alice", "avatar_url": "https://avatars/a"},
                        "head": {"ref": "feature/ci"},
                        "base": {"ref": "main"},
                        "html_url": "https://github.com/acme/widgets/pull/42",
                        "created_at": "2026-04-20T00:00:00Z",
                        "updated_at": "2026-04-25T10:00:00Z",
                    },
                ],
            )

        transport = httpx.MockTransport(handler)
        with patch("httpx.AsyncClient", _mock_client_factory(transport)):
            r = await async_client.get(
                "/api/v1/integrations/github/pulls",
                params={"repo": "acme/widgets", "state": "closed"},
                headers=auth_headers,
            )
        assert r.status_code == 200, r.text
        pulls = r.json()["data"]
        assert len(pulls) == 1
        p = pulls[0]
        assert p["number"] == 42
        assert p["state"] == "closed"
        assert p["head_ref"] == "feature/ci"
        assert p["base_ref"] == "main"
        assert p["url"].endswith("/pull/42")

    async def test_invalid_state_rejected_at_route(
        self, async_client, auth_headers, github_configured
    ):
        r = await async_client.get(
            "/api/v1/integrations/github/pulls",
            params={"repo": "acme/widgets", "state": "wibble"},
            headers=auth_headers,
        )
        assert r.status_code == 422
