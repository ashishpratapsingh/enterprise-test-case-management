"""End-to-end search-filter behaviour across list endpoints.

These tests run against SQLite (the LIKE-fallback path of
``build_search_filter``). The Postgres FTS path is exercised by the
unit tests in ``test_db_search.py`` — it can only be smoke-tested
end-to-end against a real Postgres instance.

The bug being fenced off here: ``/testcases?search=...`` and
``/testsuites?search=...`` previously silently dropped the search
filter (the base equality matcher never matched the synthetic
``search`` field on the model), and returned the unfiltered list.
"""

import pytest

pytestmark = pytest.mark.asyncio


async def _create_tc(async_client, auth_headers, project, **fields) -> str:
    body = {
        "title": fields.get("title", "tc"),
        "project_id": project.id,
        "priority": fields.get("priority", "Medium"),
    }
    if "description" in fields:
        body["description"] = fields["description"]
    r = await async_client.post("/api/v1/testcases", headers=auth_headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


async def _create_suite(async_client, auth_headers, project, **fields) -> str:
    body = {
        "name": fields.get("name", "suite"),
        "project_id": project.id,
    }
    if "description" in fields:
        body["description"] = fields["description"]
    r = await async_client.post("/api/v1/testsuites", headers=auth_headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


async def _create_defect(async_client, auth_headers, project, **fields) -> str:
    body = {
        "title": fields.get("title", "bug"),
        "project_id": project.id,
        "severity": "Medium",
        "priority": "Medium",
    }
    if "description" in fields:
        body["description"] = fields["description"]
    r = await async_client.post("/api/v1/defects", headers=auth_headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


class TestTestCasesSearch:
    async def test_search_filters_by_title_substring(
        self, async_client, auth_headers, test_project
    ):
        await _create_tc(async_client, auth_headers, test_project, title="Login flow happy path")
        await _create_tc(async_client, auth_headers, test_project, title="Logout flow")
        await _create_tc(async_client, auth_headers, test_project, title="Payment retry")

        r = await async_client.get(
            "/api/v1/testcases?search=login",
            headers=auth_headers,
        )
        assert r.status_code == 200
        items, total = r.json()["data"]
        # Exactly the one whose title contains "login".
        assert total == 1
        assert items[0]["title"] == "Login flow happy path"

    async def test_search_for_unknown_term_returns_empty(
        self, async_client, auth_headers, test_project
    ):
        await _create_tc(async_client, auth_headers, test_project, title="A")
        await _create_tc(async_client, auth_headers, test_project, title="B")

        r = await async_client.get(
            "/api/v1/testcases?search=zzz-no-match",
            headers=auth_headers,
        )
        assert r.status_code == 200
        items, total = r.json()["data"]
        assert total == 0
        assert items == []

    async def test_no_search_returns_everything(
        self, async_client, auth_headers, test_project
    ):
        await _create_tc(async_client, auth_headers, test_project, title="Alpha")
        await _create_tc(async_client, auth_headers, test_project, title="Beta")

        r = await async_client.get("/api/v1/testcases", headers=auth_headers)
        items, total = r.json()["data"]
        assert total >= 2

    async def test_search_matches_description_text(
        self, async_client, auth_headers, test_project
    ):
        await _create_tc(
            async_client,
            auth_headers,
            test_project,
            title="Some title",
            description="user can checkout via stripe",
        )
        await _create_tc(
            async_client,
            auth_headers,
            test_project,
            title="Other",
            description="paypal flow",
        )

        r = await async_client.get(
            "/api/v1/testcases?search=stripe",
            headers=auth_headers,
        )
        assert r.status_code == 200
        items, total = r.json()["data"]
        assert total == 1
        assert items[0]["title"] == "Some title"


class TestTestSuitesSearch:
    async def test_search_filters_suites_by_name(
        self, async_client, auth_headers, test_project
    ):
        await _create_suite(async_client, auth_headers, test_project, name="Smoke Suite")
        await _create_suite(async_client, auth_headers, test_project, name="Regression Suite")
        await _create_suite(async_client, auth_headers, test_project, name="Performance")

        r = await async_client.get(
            "/api/v1/testsuites?search=regression",
            headers=auth_headers,
        )
        assert r.status_code == 200
        items, total = r.json()["data"]
        assert total == 1
        assert items[0]["name"] == "Regression Suite"


class TestDefectsSearchUnchanged:
    """The defects endpoint already honoured search; this is a regression
    guard that the helper-driven implementation produces the same result."""

    async def test_filters_by_title(self, async_client, auth_headers, test_project):
        await _create_defect(async_client, auth_headers, test_project, title="Login crash on mobile")
        await _create_defect(async_client, auth_headers, test_project, title="Stripe checkout 500")

        r = await async_client.get(
            "/api/v1/defects?search=stripe",
            headers=auth_headers,
        )
        assert r.status_code == 200
        items, total = r.json()["data"]
        assert total == 1
        assert items[0]["title"] == "Stripe checkout 500"
