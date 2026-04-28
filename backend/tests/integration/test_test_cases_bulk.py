"""Integration tests for /api/v1/testcases bulk operations.

Mirrors the contract tests for /defects/bulk-* — partial success
(missing IDs, illegal transitions) is reported, not raised — so the UI
can always render a result panel.
"""

import pytest

pytestmark = pytest.mark.asyncio


async def _create_test_case(async_client, auth_headers, project, **overrides) -> str:
    body = {
        "title": overrides.get("title", "Bulk-tc"),
        "project_id": project.id,
        "priority": overrides.get("priority", "Medium"),
    }
    body.update({k: v for k, v in overrides.items() if k not in body})
    r = await async_client.post("/api/v1/testcases", headers=auth_headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


class TestBulkDelete:
    async def test_deletes_existing_and_reports_missing(
        self, async_client, auth_headers, test_project
    ):
        tc1 = await _create_test_case(async_client, auth_headers, test_project, title="bd-1")
        tc2 = await _create_test_case(async_client, auth_headers, test_project, title="bd-2")
        missing = "00000000-0000-0000-0000-000000000000"

        r = await async_client.post(
            "/api/v1/testcases/bulk-delete",
            headers=auth_headers,
            json={"ids": [tc1, tc2, missing]},
        )
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert sorted(data["succeeded"]) == sorted([tc1, tc2])
        assert len(data["failed"]) == 1
        assert data["failed"][0]["id"] == missing

        # Both should be gone from the listing.
        listing = await async_client.get("/api/v1/testcases", headers=auth_headers)
        items, _ = listing.json()["data"]
        ids = [tc["id"] for tc in items]
        assert tc1 not in ids
        assert tc2 not in ids

    async def test_empty_ids_is_validation_error(self, async_client, auth_headers):
        r = await async_client.post(
            "/api/v1/testcases/bulk-delete",
            headers=auth_headers,
            json={"ids": []},
        )
        assert r.status_code == 422


class TestBulkTransitionApproval:
    async def test_advances_drafts(
        self, async_client, auth_headers, test_project
    ):
        # Fresh cases default to status=Draft, which legally goes to Ready.
        tc1 = await _create_test_case(async_client, auth_headers, test_project, title="d1")
        tc2 = await _create_test_case(async_client, auth_headers, test_project, title="d2")

        r = await async_client.post(
            "/api/v1/testcases/bulk-transition",
            headers=auth_headers,
            json={"ids": [tc1, tc2], "status": "Ready"},
        )
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert sorted(data["succeeded"]) == sorted([tc1, tc2])
        assert data["failed"] == []

        # Confirm the rows actually transitioned.
        for tcid in (tc1, tc2):
            view = await async_client.get(
                f"/api/v1/testcases/{tcid}", headers=auth_headers
            )
            assert view.json()["data"]["status"] == "Ready"

    async def test_reports_invalid_transitions(
        self, async_client, auth_headers, test_project
    ):
        # Two Drafts + one we'll walk Draft → Ready → Approved via two
        # separate bulk calls. Approved can only go back to Draft, so
        # the third call (asking for Ready) must fail for that one.
        tc_d1 = await _create_test_case(async_client, auth_headers, test_project, title="i1")
        tc_d2 = await _create_test_case(async_client, auth_headers, test_project, title="i2")
        tc_a = await _create_test_case(async_client, auth_headers, test_project, title="i3")

        # Walk tc_a → Approved.
        for next_status in ("Ready", "Approved"):
            r = await async_client.post(
                "/api/v1/testcases/bulk-transition",
                headers=auth_headers,
                json={"ids": [tc_a], "status": next_status},
            )
            assert r.status_code == 200, r.text
            assert r.json()["data"]["succeeded"] == [tc_a]

        # Now bulk to Ready: tc_d1/tc_d2 succeed; tc_a fails.
        r = await async_client.post(
            "/api/v1/testcases/bulk-transition",
            headers=auth_headers,
            json={"ids": [tc_d1, tc_d2, tc_a], "status": "Ready"},
        )
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert sorted(data["succeeded"]) == sorted([tc_d1, tc_d2])
        assert len(data["failed"]) == 1
        assert data["failed"][0]["id"] == tc_a


class TestBulkUpdate:
    async def test_updates_priority_and_type_together(
        self, async_client, auth_headers, test_project
    ):
        tc1 = await _create_test_case(async_client, auth_headers, test_project, title="u1")
        tc2 = await _create_test_case(async_client, auth_headers, test_project, title="u2")

        r = await async_client.post(
            "/api/v1/testcases/bulk-update",
            headers=auth_headers,
            json={
                "ids": [tc1, tc2],
                "priority": "Critical",
                "type": "Smoke",
            },
        )
        assert r.status_code == 200, r.text
        assert sorted(r.json()["data"]["succeeded"]) == sorted([tc1, tc2])

        # Confirm rows actually changed.
        for tcid in (tc1, tc2):
            view = await async_client.get(
                f"/api/v1/testcases/{tcid}", headers=auth_headers
            )
            assert view.json()["data"]["priority"] == "Critical"
            assert view.json()["data"]["type"] == "Smoke"

    async def test_only_priority_leaves_other_fields_alone(
        self, async_client, auth_headers, test_project
    ):
        tc1 = await _create_test_case(
            async_client, auth_headers, test_project, title="p1", type="Functional"
        )
        r = await async_client.post(
            "/api/v1/testcases/bulk-update",
            headers=auth_headers,
            json={"ids": [tc1], "priority": "High"},
        )
        assert r.status_code == 200

        view = await async_client.get(
            f"/api/v1/testcases/{tc1}", headers=auth_headers
        )
        assert view.json()["data"]["priority"] == "High"
        assert view.json()["data"]["type"] == "Functional"  # unchanged

    async def test_unassign_clears_assignee(
        self, async_client, auth_headers, test_project, test_user
    ):
        tc1 = await _create_test_case(
            async_client,
            auth_headers,
            test_project,
            title="ua1",
            assigned_to=str(test_user.id),
        )

        # Confirm starting state.
        view = await async_client.get(
            f"/api/v1/testcases/{tc1}", headers=auth_headers
        )
        assert view.json()["data"]["assigned_to"] == str(test_user.id)

        r = await async_client.post(
            "/api/v1/testcases/bulk-update",
            headers=auth_headers,
            json={"ids": [tc1], "unassign": True},
        )
        assert r.status_code == 200

        view = await async_client.get(
            f"/api/v1/testcases/{tc1}", headers=auth_headers
        )
        assert view.json()["data"]["assigned_to"] is None

    async def test_no_fields_returns_422(
        self, async_client, auth_headers, test_project
    ):
        tc1 = await _create_test_case(async_client, auth_headers, test_project, title="n1")
        r = await async_client.post(
            "/api/v1/testcases/bulk-update",
            headers=auth_headers,
            json={"ids": [tc1]},
        )
        assert r.status_code == 422

    async def test_missing_ids_reported(
        self, async_client, auth_headers
    ):
        r = await async_client.post(
            "/api/v1/testcases/bulk-update",
            headers=auth_headers,
            json={
                "ids": ["00000000-0000-0000-0000-000000000000"],
                "priority": "Low",
            },
        )
        assert r.status_code == 200
        assert r.json()["data"]["succeeded"] == []
        assert len(r.json()["data"]["failed"]) == 1
