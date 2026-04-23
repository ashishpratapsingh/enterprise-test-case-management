"""Integration tests covering the primary CRUD flows across routers.

Each test walks create → list → filter → update → delete against the real
FastAPI app using the ``async_client`` fixture, which reuses the test
``db_session``.
"""

import pytest

pytestmark = pytest.mark.asyncio


# ─── Test Cases ────────────────────────────────────────────────────────────


class TestTestCasesCrud:
    async def test_crud_flow(self, async_client, auth_headers, test_project):
        # Create
        r = await async_client.post(
            "/api/v1/testcases",
            headers=auth_headers,
            json={"title": "Login works", "project_id": test_project.id, "priority": "High"},
        )
        assert r.status_code == 201, r.text
        tc = r.json()["data"]
        assert tc["title"] == "Login works"
        assert tc["test_case_id"].startswith(f"TC-{test_project.code}-")
        tc_id = tc["id"]

        # List (should include the new one)
        r = await async_client.get(
            "/api/v1/testcases",
            headers=auth_headers,
            params={"page": 1, "page_size": 20},
        )
        assert r.status_code == 200
        items, total = r.json()["data"]
        assert total >= 1
        assert any(item["id"] == tc_id for item in items)

        # Filter by priority
        r = await async_client.get(
            "/api/v1/testcases",
            headers=auth_headers,
            params={"priority": "High", "project_id": test_project.id},
        )
        assert r.status_code == 200
        items, _ = r.json()["data"]
        assert all(item["priority"] == "High" for item in items)

        # Update
        r = await async_client.put(
            f"/api/v1/testcases/{tc_id}",
            headers=auth_headers,
            json={"title": "Login works — updated"},
        )
        assert r.status_code == 200
        assert r.json()["data"]["title"] == "Login works — updated"

        # Delete
        r = await async_client.delete(
            f"/api/v1/testcases/{tc_id}",
            headers=auth_headers,
        )
        assert r.status_code in (200, 204)

        # Confirm soft-delete — list no longer returns it
        r = await async_client.get(
            "/api/v1/testcases",
            headers=auth_headers,
            params={"page": 1, "page_size": 100},
        )
        items, _ = r.json()["data"]
        assert all(item["id"] != tc_id for item in items)


# ─── Defects ───────────────────────────────────────────────────────────────


class TestDefectsCrud:
    async def test_crud_flow(self, async_client, auth_headers, test_project):
        # Create
        r = await async_client.post(
            "/api/v1/defects",
            headers=auth_headers,
            json={
                "title": "Login button unresponsive",
                "project_id": test_project.id,
                "severity": "High",
                "priority": "High",
            },
        )
        assert r.status_code == 201, r.text
        defect = r.json()["data"]
        assert defect["defect_id"].startswith(f"BUG-{test_project.code}-")
        assert defect["status"] == "Open"
        defect_id = defect["id"]

        # List
        r = await async_client.get(
            "/api/v1/defects",
            headers=auth_headers,
            params={"page": 1, "page_size": 20},
        )
        assert r.status_code == 200
        items, total = r.json()["data"]
        assert total >= 1
        assert any(d["id"] == defect_id for d in items)

        # Filter by severity
        r = await async_client.get(
            "/api/v1/defects",
            headers=auth_headers,
            params={"severity": "High"},
        )
        assert r.status_code == 200
        items, _ = r.json()["data"]
        assert all(d["severity"] == "High" for d in items)

        # Update
        r = await async_client.put(
            f"/api/v1/defects/{defect_id}",
            headers=auth_headers,
            json={"title": "Login button unresponsive on mobile"},
        )
        assert r.status_code == 200
        assert "mobile" in r.json()["data"]["title"]

        # Delete
        r = await async_client.delete(
            f"/api/v1/defects/{defect_id}",
            headers=auth_headers,
        )
        assert r.status_code in (200, 204)


# ─── Test Suites ───────────────────────────────────────────────────────────


class TestTestSuitesCrud:
    async def test_crud_flow(self, async_client, auth_headers, test_project):
        # Create
        r = await async_client.post(
            "/api/v1/testsuites",
            headers=auth_headers,
            json={"name": "Smoke", "project_id": test_project.id, "is_active": True},
        )
        assert r.status_code == 201, r.text
        suite_id = r.json()["data"]["id"]

        # Filter by is_active=true
        r = await async_client.get(
            "/api/v1/testsuites",
            headers=auth_headers,
            params={"is_active": "true"},
        )
        assert r.status_code == 200
        items, _ = r.json()["data"]
        assert all(s["is_active"] for s in items)

        # Filter by is_active=false — must return zero here
        r = await async_client.get(
            "/api/v1/testsuites",
            headers=auth_headers,
            params={"is_active": "false"},
        )
        assert r.status_code == 200
        items, _ = r.json()["data"]
        assert all(not s["is_active"] for s in items)

        # Update
        r = await async_client.put(
            f"/api/v1/testsuites/{suite_id}",
            headers=auth_headers,
            json={"name": "Smoke — v2"},
        )
        assert r.status_code == 200
        assert r.json()["data"]["name"] == "Smoke — v2"

        # Delete
        r = await async_client.delete(
            f"/api/v1/testsuites/{suite_id}",
            headers=auth_headers,
        )
        assert r.status_code in (200, 204)


# ─── Test Runs ─────────────────────────────────────────────────────────────


class TestTestRunsCrud:
    async def test_crud_flow(self, async_client, auth_headers, test_project):
        # Need a suite first
        r = await async_client.post(
            "/api/v1/testsuites",
            headers=auth_headers,
            json={"name": "Run-bound Suite", "project_id": test_project.id},
        )
        assert r.status_code == 201, r.text
        suite_id = r.json()["data"]["id"]

        # Create run
        r = await async_client.post(
            "/api/v1/testruns",
            headers=auth_headers,
            json={"name": "Nightly", "test_suite_id": suite_id},
        )
        assert r.status_code == 201, r.text
        run = r.json()["data"]
        assert run["status"] == "Not Started"
        run_id = run["id"]

        # List
        r = await async_client.get(
            "/api/v1/testruns",
            headers=auth_headers,
            params={"page": 1, "page_size": 20},
        )
        assert r.status_code == 200
        items, _ = r.json()["data"]
        assert any(x["id"] == run_id for x in items)

        # Update
        r = await async_client.put(
            f"/api/v1/testruns/{run_id}",
            headers=auth_headers,
            json={"name": "Nightly — rescheduled"},
        )
        assert r.status_code == 200
        assert "rescheduled" in r.json()["data"]["name"]

        # Delete
        r = await async_client.delete(
            f"/api/v1/testruns/{run_id}",
            headers=auth_headers,
        )
        assert r.status_code in (200, 204)


# ─── Projects (RoleChecker route) ──────────────────────────────────────────


class TestProjectsCrud:
    async def test_crud_flow(self, async_client, auth_headers, test_user):
        # test_user has role "Admin" (slug "admin") so RoleChecker should allow
        suffix = test_user.email.split("_")[1].split("@")[0]
        r = await async_client.post(
            "/api/v1/projects",
            headers=auth_headers,
            json={
                "name": f"Project_{suffix}",
                "code": f"PX{suffix.upper()[:6]}",
                "description": "Integration test project",
            },
        )
        assert r.status_code == 201, r.text
        project_id = r.json()["data"]["id"]

        # List
        r = await async_client.get("/api/v1/projects", headers=auth_headers)
        assert r.status_code == 200

        # Update
        r = await async_client.put(
            f"/api/v1/projects/{project_id}",
            headers=auth_headers,
            json={"description": "Updated description"},
        )
        assert r.status_code == 200
        assert r.json()["data"]["description"] == "Updated description"

        # Delete
        r = await async_client.delete(
            f"/api/v1/projects/{project_id}",
            headers=auth_headers,
        )
        assert r.status_code in (200, 204)


# ─── Epics ─────────────────────────────────────────────────────────────────


class TestEpicsCrud:
    async def test_crud_flow(self, async_client, auth_headers, test_project):
        r = await async_client.post(
            "/api/v1/epics",
            headers=auth_headers,
            json={
                "title": "Auth revamp",
                "project_id": test_project.id,
                "priority": "High",
            },
        )
        assert r.status_code == 201, r.text
        epic_id = r.json()["data"]["id"]

        r = await async_client.get(
            "/api/v1/epics",
            headers=auth_headers,
            params={"priority": "High"},
        )
        assert r.status_code == 200
        items, _ = r.json()["data"]
        assert all(e["priority"] == "High" for e in items)

        r = await async_client.put(
            f"/api/v1/epics/{epic_id}",
            headers=auth_headers,
            json={"title": "Auth revamp — Q2"},
        )
        assert r.status_code == 200

        r = await async_client.delete(
            f"/api/v1/epics/{epic_id}",
            headers=auth_headers,
        )
        assert r.status_code in (200, 204)


# ─── User Stories ──────────────────────────────────────────────────────────


class TestUserStoriesCrud:
    async def test_crud_flow(self, async_client, auth_headers, test_project):
        # Create an epic to hang the story on
        r = await async_client.post(
            "/api/v1/epics",
            headers=auth_headers,
            json={"title": "US parent", "project_id": test_project.id},
        )
        assert r.status_code == 201, r.text
        epic_id = r.json()["data"]["id"]

        r = await async_client.post(
            "/api/v1/user-stories",
            headers=auth_headers,
            json={
                "title": "As a user I log in",
                "project_id": test_project.id,
                "epic_id": epic_id,
                "priority": "Medium",
            },
        )
        assert r.status_code == 201, r.text
        story_id = r.json()["data"]["id"]

        r = await async_client.get(
            "/api/v1/user-stories",
            headers=auth_headers,
            params={"epic_id": epic_id},
        )
        assert r.status_code == 200
        items, _ = r.json()["data"]
        assert all(s["epic_id"] == epic_id for s in items)

        r = await async_client.put(
            f"/api/v1/user-stories/{story_id}",
            headers=auth_headers,
            json={"title": "As a user I log in with MFA"},
        )
        assert r.status_code == 200

        r = await async_client.delete(
            f"/api/v1/user-stories/{story_id}",
            headers=auth_headers,
        )
        assert r.status_code in (200, 204)
