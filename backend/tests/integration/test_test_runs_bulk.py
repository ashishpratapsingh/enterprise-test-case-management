"""Integration tests for /api/v1/testruns bulk operations."""

import pytest

pytestmark = pytest.mark.asyncio


async def _create_suite(async_client, auth_headers, project) -> str:
    r = await async_client.post(
        "/api/v1/testsuites",
        headers=auth_headers,
        json={"name": "Bulk-runs suite", "project_id": project.id},
    )
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


async def _create_run(async_client, auth_headers, suite_id, **overrides) -> str:
    body = {
        "name": overrides.get("name", "Bulk-run"),
        "test_suite_id": suite_id,
    }
    body.update({k: v for k, v in overrides.items() if k not in body})
    r = await async_client.post("/api/v1/testruns", headers=auth_headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


class TestBulkDelete:
    async def test_deletes_existing_and_reports_missing(
        self, async_client, auth_headers, test_project
    ):
        suite = await _create_suite(async_client, auth_headers, test_project)
        r1 = await _create_run(async_client, auth_headers, suite, name="d1")
        r2 = await _create_run(async_client, auth_headers, suite, name="d2")
        missing = "00000000-0000-0000-0000-000000000000"

        r = await async_client.post(
            "/api/v1/testruns/bulk-delete",
            headers=auth_headers,
            json={"ids": [r1, r2, missing]},
        )
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert sorted(data["succeeded"]) == sorted([r1, r2])
        assert len(data["failed"]) == 1

    async def test_empty_ids_is_validation_error(self, async_client, auth_headers):
        r = await async_client.post(
            "/api/v1/testruns/bulk-delete",
            headers=auth_headers,
            json={"ids": []},
        )
        assert r.status_code == 422


class TestBulkCancel:
    async def test_cancels_runs_in_legal_states(
        self, async_client, auth_headers, test_project
    ):
        suite = await _create_suite(async_client, auth_headers, test_project)
        r_ns = await _create_run(async_client, auth_headers, suite, name="ns")  # Not Started
        r_ip = await _create_run(async_client, auth_headers, suite, name="ip")
        # Move r_ip into "In Progress" via the per-row start endpoint.
        st = await async_client.post(
            f"/api/v1/testruns/{r_ip}/start", headers=auth_headers
        )
        assert st.status_code == 200, st.text

        r = await async_client.post(
            "/api/v1/testruns/bulk-cancel",
            headers=auth_headers,
            json={"ids": [r_ns, r_ip], "abort_reason": "Release scrapped"},
        )
        assert r.status_code == 200, r.text
        assert sorted(r.json()["data"]["succeeded"]) == sorted([r_ns, r_ip])

        for rid in (r_ns, r_ip):
            view = await async_client.get(f"/api/v1/testruns/{rid}", headers=auth_headers)
            assert view.json()["data"]["status"] == "Cancelled"
            assert view.json()["data"]["abort_reason"] == "Release scrapped"

    async def test_completed_runs_cannot_be_cancelled(
        self, async_client, auth_headers, test_project
    ):
        """Completed is terminal — cancel must be reported as failed
        per-row, not raise."""
        suite = await _create_suite(async_client, auth_headers, test_project)
        r_done = await _create_run(async_client, auth_headers, suite, name="done")
        # Walk to Completed: Not Started → In Progress → Completed.
        await async_client.post(f"/api/v1/testruns/{r_done}/start", headers=auth_headers)
        await async_client.post(f"/api/v1/testruns/{r_done}/complete", headers=auth_headers)

        r_ns = await _create_run(async_client, auth_headers, suite, name="legal")

        r = await async_client.post(
            "/api/v1/testruns/bulk-cancel",
            headers=auth_headers,
            json={"ids": [r_ns, r_done]},
        )
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["succeeded"] == [r_ns]
        assert len(data["failed"]) == 1
        assert data["failed"][0]["id"] == r_done

    async def test_missing_ids_reported(
        self, async_client, auth_headers
    ):
        r = await async_client.post(
            "/api/v1/testruns/bulk-cancel",
            headers=auth_headers,
            json={"ids": ["00000000-0000-0000-0000-000000000000"]},
        )
        assert r.status_code == 200
        assert r.json()["data"]["succeeded"] == []
        assert len(r.json()["data"]["failed"]) == 1
