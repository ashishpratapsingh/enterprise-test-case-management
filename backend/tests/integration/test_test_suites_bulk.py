"""Integration tests for /api/v1/testsuites bulk operations."""

import pytest

pytestmark = pytest.mark.asyncio


async def _create_suite(async_client, auth_headers, project, **overrides) -> str:
    body = {
        "name": overrides.get("name", "Bulk-suite"),
        "description": overrides.get("description", "Test bulk"),
        "project_id": project.id,
        "is_active": overrides.get("is_active", True),
    }
    body.update({k: v for k, v in overrides.items() if k not in body})
    r = await async_client.post("/api/v1/testsuites", headers=auth_headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


class TestBulkDelete:
    async def test_deletes_existing_and_reports_missing(
        self, async_client, auth_headers, test_project
    ):
        s1 = await _create_suite(async_client, auth_headers, test_project, name="d1")
        s2 = await _create_suite(async_client, auth_headers, test_project, name="d2")
        missing = "00000000-0000-0000-0000-000000000000"

        r = await async_client.post(
            "/api/v1/testsuites/bulk-delete",
            headers=auth_headers,
            json={"ids": [s1, s2, missing]},
        )
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert sorted(data["succeeded"]) == sorted([s1, s2])
        assert len(data["failed"]) == 1

    async def test_empty_ids_is_validation_error(self, async_client, auth_headers):
        r = await async_client.post(
            "/api/v1/testsuites/bulk-delete",
            headers=auth_headers,
            json={"ids": []},
        )
        assert r.status_code == 422


class TestBulkSetActive:
    async def test_deactivates_then_reactivates(
        self, async_client, auth_headers, test_project
    ):
        s1 = await _create_suite(async_client, auth_headers, test_project, name="a1")
        s2 = await _create_suite(async_client, auth_headers, test_project, name="a2")

        r = await async_client.post(
            "/api/v1/testsuites/bulk-set-active",
            headers=auth_headers,
            json={"ids": [s1, s2], "is_active": False},
        )
        assert r.status_code == 200
        assert sorted(r.json()["data"]["succeeded"]) == sorted([s1, s2])

        for sid in (s1, s2):
            view = await async_client.get(f"/api/v1/testsuites/{sid}", headers=auth_headers)
            assert view.json()["data"]["is_active"] is False

        # Reactivate.
        r = await async_client.post(
            "/api/v1/testsuites/bulk-set-active",
            headers=auth_headers,
            json={"ids": [s1, s2], "is_active": True},
        )
        assert r.status_code == 200
        for sid in (s1, s2):
            view = await async_client.get(f"/api/v1/testsuites/{sid}", headers=auth_headers)
            assert view.json()["data"]["is_active"] is True

    async def test_missing_ids_reported(
        self, async_client, auth_headers
    ):
        r = await async_client.post(
            "/api/v1/testsuites/bulk-set-active",
            headers=auth_headers,
            json={
                "ids": ["00000000-0000-0000-0000-000000000000"],
                "is_active": False,
            },
        )
        assert r.status_code == 200
        assert r.json()["data"]["succeeded"] == []
        assert len(r.json()["data"]["failed"]) == 1
