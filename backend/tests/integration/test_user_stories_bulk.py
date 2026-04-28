"""Integration tests for /api/v1/user-stories bulk operations."""

import pytest

pytestmark = pytest.mark.asyncio


async def _create_epic(async_client, auth_headers, project, **overrides) -> str:
    body = {
        "title": overrides.get("title", "Bulk-epic"),
        "project_id": project.id,
        "priority": "medium",
        "start_date": "2026-01-01",
        "due_date": "2026-12-31",
    }
    body.update({k: v for k, v in overrides.items() if k not in body})
    r = await async_client.post("/api/v1/epics", headers=auth_headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


async def _create_story(async_client, auth_headers, project, epic_id, **overrides) -> str:
    body = {
        "title": overrides.get("title", "Bulk-story"),
        "project_id": project.id,
        "epic_id": epic_id,
        "priority": overrides.get("priority", "medium"),
        "status": overrides.get("status", "open"),
    }
    body.update({k: v for k, v in overrides.items() if k not in body})
    r = await async_client.post("/api/v1/user-stories", headers=auth_headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


class TestBulkDelete:
    async def test_deletes_existing_and_reports_missing(
        self, async_client, auth_headers, test_project
    ):
        epic = await _create_epic(async_client, auth_headers, test_project)
        s1 = await _create_story(async_client, auth_headers, test_project, epic, title="d1")
        s2 = await _create_story(async_client, auth_headers, test_project, epic, title="d2")
        missing = "00000000-0000-0000-0000-000000000000"

        r = await async_client.post(
            "/api/v1/user-stories/bulk-delete",
            headers=auth_headers,
            json={"ids": [s1, s2, missing]},
        )
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert sorted(data["succeeded"]) == sorted([s1, s2])
        assert len(data["failed"]) == 1
        assert data["failed"][0]["id"] == missing

    async def test_empty_ids_is_validation_error(self, async_client, auth_headers):
        r = await async_client.post(
            "/api/v1/user-stories/bulk-delete",
            headers=auth_headers,
            json={"ids": []},
        )
        assert r.status_code == 422


class TestBulkUpdate:
    async def test_updates_status_and_priority_together(
        self, async_client, auth_headers, test_project
    ):
        epic = await _create_epic(async_client, auth_headers, test_project)
        s1 = await _create_story(async_client, auth_headers, test_project, epic, title="u1")
        s2 = await _create_story(async_client, auth_headers, test_project, epic, title="u2")

        r = await async_client.post(
            "/api/v1/user-stories/bulk-update",
            headers=auth_headers,
            json={"ids": [s1, s2], "status": "done", "priority": "high"},
        )
        assert r.status_code == 200, r.text
        assert sorted(r.json()["data"]["succeeded"]) == sorted([s1, s2])

        for sid in (s1, s2):
            view = await async_client.get(f"/api/v1/user-stories/{sid}", headers=auth_headers)
            assert view.json()["data"]["status"] == "done"
            assert view.json()["data"]["priority"] == "high"

    async def test_reassigns_to_a_different_epic(
        self, async_client, auth_headers, test_project
    ):
        epic_a = await _create_epic(async_client, auth_headers, test_project, title="A")
        epic_b = await _create_epic(async_client, auth_headers, test_project, title="B")
        s1 = await _create_story(async_client, auth_headers, test_project, epic_a, title="r1")

        r = await async_client.post(
            "/api/v1/user-stories/bulk-update",
            headers=auth_headers,
            json={"ids": [s1], "epic_id": epic_b},
        )
        assert r.status_code == 200

        view = await async_client.get(f"/api/v1/user-stories/{s1}", headers=auth_headers)
        assert view.json()["data"]["epic_id"] == epic_b

    async def test_clear_epic_unlinks(
        self, async_client, auth_headers, test_project
    ):
        epic = await _create_epic(async_client, auth_headers, test_project)
        s1 = await _create_story(async_client, auth_headers, test_project, epic, title="c1")

        r = await async_client.post(
            "/api/v1/user-stories/bulk-update",
            headers=auth_headers,
            json={"ids": [s1], "clear_epic": True},
        )
        assert r.status_code == 200

        view = await async_client.get(f"/api/v1/user-stories/{s1}", headers=auth_headers)
        assert view.json()["data"]["epic_id"] is None

    async def test_unassign_clears_assignee(
        self, async_client, auth_headers, test_project, test_user
    ):
        epic = await _create_epic(async_client, auth_headers, test_project)
        s1 = await _create_story(
            async_client, auth_headers, test_project, epic,
            title="ua1", assigned_to=str(test_user.id),
        )
        view = await async_client.get(f"/api/v1/user-stories/{s1}", headers=auth_headers)
        assert view.json()["data"]["assigned_to"] == str(test_user.id)

        r = await async_client.post(
            "/api/v1/user-stories/bulk-update",
            headers=auth_headers,
            json={"ids": [s1], "unassign": True},
        )
        assert r.status_code == 200

        view = await async_client.get(f"/api/v1/user-stories/{s1}", headers=auth_headers)
        assert view.json()["data"]["assigned_to"] is None

    async def test_sets_story_points(
        self, async_client, auth_headers, test_project
    ):
        epic = await _create_epic(async_client, auth_headers, test_project)
        s1 = await _create_story(async_client, auth_headers, test_project, epic, title="sp1")
        s2 = await _create_story(async_client, auth_headers, test_project, epic, title="sp2")

        r = await async_client.post(
            "/api/v1/user-stories/bulk-update",
            headers=auth_headers,
            json={"ids": [s1, s2], "story_points": 5},
        )
        assert r.status_code == 200, r.text
        assert sorted(r.json()["data"]["succeeded"]) == sorted([s1, s2])

        for sid in (s1, s2):
            view = await async_client.get(f"/api/v1/user-stories/{sid}", headers=auth_headers)
            assert view.json()["data"]["story_points"] == 5

    async def test_clear_story_points(
        self, async_client, auth_headers, test_project
    ):
        epic = await _create_epic(async_client, auth_headers, test_project)
        s1 = await _create_story(
            async_client, auth_headers, test_project, epic, title="sp-clear", story_points=8
        )
        view = await async_client.get(f"/api/v1/user-stories/{s1}", headers=auth_headers)
        assert view.json()["data"]["story_points"] == 8

        r = await async_client.post(
            "/api/v1/user-stories/bulk-update",
            headers=auth_headers,
            json={"ids": [s1], "clear_story_points": True},
        )
        assert r.status_code == 200

        view = await async_client.get(f"/api/v1/user-stories/{s1}", headers=auth_headers)
        assert view.json()["data"]["story_points"] is None

    async def test_negative_story_points_rejected(
        self, async_client, auth_headers, test_project
    ):
        epic = await _create_epic(async_client, auth_headers, test_project)
        s1 = await _create_story(async_client, auth_headers, test_project, epic, title="neg")
        r = await async_client.post(
            "/api/v1/user-stories/bulk-update",
            headers=auth_headers,
            json={"ids": [s1], "story_points": -1},
        )
        assert r.status_code == 422

    async def test_non_fibonacci_story_points_rejected(
        self, async_client, auth_headers, test_project
    ):
        """4, 6, 7 etc. are not on the Fibonacci scale and must be
        rejected. Allowed: {0, 1, 2, 3, 5, 8, 13}."""
        epic = await _create_epic(async_client, auth_headers, test_project)
        s1 = await _create_story(async_client, auth_headers, test_project, epic, title="nf")
        for bad in (4, 6, 7, 9, 10, 14):
            r = await async_client.post(
                "/api/v1/user-stories/bulk-update",
                headers=auth_headers,
                json={"ids": [s1], "story_points": bad},
            )
            assert r.status_code == 422, f"value {bad} should be rejected"

    async def test_fibonacci_story_points_accepted(
        self, async_client, auth_headers, test_project
    ):
        """All values on the Fibonacci scale must succeed."""
        epic = await _create_epic(async_client, auth_headers, test_project)
        for good in (0, 1, 2, 3, 5, 8, 13):
            sid = await _create_story(
                async_client, auth_headers, test_project, epic, title=f"fib-{good}"
            )
            r = await async_client.post(
                "/api/v1/user-stories/bulk-update",
                headers=auth_headers,
                json={"ids": [sid], "story_points": good},
            )
            assert r.status_code == 200, f"value {good} should be accepted"
            view = await async_client.get(
                f"/api/v1/user-stories/{sid}", headers=auth_headers
            )
            assert view.json()["data"]["story_points"] == good

    async def test_no_fields_returns_422(
        self, async_client, auth_headers, test_project
    ):
        epic = await _create_epic(async_client, auth_headers, test_project)
        s1 = await _create_story(async_client, auth_headers, test_project, epic, title="z1")
        r = await async_client.post(
            "/api/v1/user-stories/bulk-update",
            headers=auth_headers,
            json={"ids": [s1]},
        )
        assert r.status_code == 422

    async def test_missing_ids_reported(
        self, async_client, auth_headers
    ):
        r = await async_client.post(
            "/api/v1/user-stories/bulk-update",
            headers=auth_headers,
            json={
                "ids": ["00000000-0000-0000-0000-000000000000"],
                "priority": "low",
            },
        )
        assert r.status_code == 200
        assert r.json()["data"]["succeeded"] == []
        assert len(r.json()["data"]["failed"]) == 1
