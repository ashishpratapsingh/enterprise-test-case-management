"""Integration tests for /api/v1/defects bulk operations."""

import pytest

pytestmark = pytest.mark.asyncio


async def _create_defect(async_client, auth_headers, project, **overrides) -> str:
    body = {
        "title": overrides.get("title", "Bulk-bug"),
        "project_id": project.id,
        "severity": overrides.get("severity", "Medium"),
        "priority": overrides.get("priority", "Medium"),
    }
    body.update({k: v for k, v in overrides.items() if k not in body})
    r = await async_client.post("/api/v1/defects", headers=auth_headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


class TestBulkDelete:
    async def test_deletes_existing_and_reports_missing(
        self, async_client, auth_headers, test_project
    ):
        d1 = await _create_defect(async_client, auth_headers, test_project, title="b1")
        d2 = await _create_defect(async_client, auth_headers, test_project, title="b2")
        missing = "00000000-0000-0000-0000-000000000000"

        r = await async_client.post(
            "/api/v1/defects/bulk-delete",
            headers=auth_headers,
            json={"ids": [d1, d2, missing]},
        )
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert sorted(data["succeeded"]) == sorted([d1, d2])
        assert len(data["failed"]) == 1
        assert data["failed"][0]["id"] == missing

        # Both deleted defects must be gone from the listing.
        listing = await async_client.get("/api/v1/defects", headers=auth_headers)
        items, _ = listing.json()["data"]
        ids = [d["id"] for d in items]
        assert d1 not in ids
        assert d2 not in ids

    async def test_empty_ids_is_validation_error(self, async_client, auth_headers):
        r = await async_client.post(
            "/api/v1/defects/bulk-delete",
            headers=auth_headers,
            json={"ids": []},
        )
        assert r.status_code == 422


class TestBulkTransition:
    async def test_transitions_allowed_and_reports_invalid(
        self, async_client, auth_headers, test_project
    ):
        # Two open defects + one we'll move to In Progress first so it can't go
        # straight to In Progress again (transition table forbids it).
        d_open_1 = await _create_defect(async_client, auth_headers, test_project, title="o1")
        d_open_2 = await _create_defect(async_client, auth_headers, test_project, title="o2")
        d_inprog = await _create_defect(async_client, auth_headers, test_project, title="ip")
        await async_client.post(
            f"/api/v1/defects/{d_inprog}/transition",
            headers=auth_headers,
            json={"status": "In Progress"},
        )

        r = await async_client.post(
            "/api/v1/defects/bulk-transition",
            headers=auth_headers,
            json={"ids": [d_open_1, d_open_2, d_inprog], "status": "In Progress"},
        )
        assert r.status_code == 200
        data = r.json()["data"]
        assert sorted(data["succeeded"]) == sorted([d_open_1, d_open_2])
        assert len(data["failed"]) == 1
        assert data["failed"][0]["id"] == d_inprog


class TestBulkAssign:
    async def test_assigns_then_unassigns(
        self, async_client, auth_headers, test_project, test_user
    ):
        d1 = await _create_defect(async_client, auth_headers, test_project, title="a1")
        d2 = await _create_defect(async_client, auth_headers, test_project, title="a2")

        # Assign both to test_user.
        r = await async_client.post(
            "/api/v1/defects/bulk-assign",
            headers=auth_headers,
            json={"ids": [d1, d2], "assigned_to": str(test_user.id)},
        )
        assert r.status_code == 200
        assert sorted(r.json()["data"]["succeeded"]) == sorted([d1, d2])

        # Unassign — null in payload.
        r = await async_client.post(
            "/api/v1/defects/bulk-assign",
            headers=auth_headers,
            json={"ids": [d1, d2], "assigned_to": None},
        )
        assert r.status_code == 200
        assert sorted(r.json()["data"]["succeeded"]) == sorted([d1, d2])

    async def test_missing_ids_reported(
        self, async_client, auth_headers, test_user
    ):
        r = await async_client.post(
            "/api/v1/defects/bulk-assign",
            headers=auth_headers,
            json={"ids": ["00000000-0000-0000-0000-000000000000"], "assigned_to": str(test_user.id)},
        )
        assert r.status_code == 200
        assert r.json()["data"]["succeeded"] == []
        assert len(r.json()["data"]["failed"]) == 1
