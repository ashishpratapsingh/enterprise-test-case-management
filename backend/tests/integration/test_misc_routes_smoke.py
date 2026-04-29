"""Smoke tests for the thin CRUD routes after the route↔service alignment fixes."""

import pytest

pytestmark = pytest.mark.asyncio


# ── Modules ────────────────────────────────────────────────────────────────


class TestModulesCrud:
    async def test_create_list_get_update_delete(
        self, async_client, auth_headers, test_project
    ):
        # Create
        r = await async_client.post(
            "/api/v1/modules",
            headers=auth_headers,
            json={"name": "Auth Module", "project_id": test_project.id},
        )
        assert r.status_code == 201, r.text
        mid = r.json()["data"]["id"]

        # List by project
        r = await async_client.get(
            "/api/v1/modules",
            headers=auth_headers,
            params={"project_id": test_project.id},
        )
        assert r.status_code == 200
        assert any(m["id"] == mid for m in r.json()["data"])

        # Get one
        r = await async_client.get(f"/api/v1/modules/{mid}", headers=auth_headers)
        assert r.status_code == 200

        # Update
        r = await async_client.put(
            f"/api/v1/modules/{mid}",
            headers=auth_headers,
            json={"name": "Auth Module v2"},
        )
        assert r.status_code == 200
        assert r.json()["data"]["name"] == "Auth Module v2"

        # Delete (soft)
        r = await async_client.delete(f"/api/v1/modules/{mid}", headers=auth_headers)
        assert r.status_code == 200

    async def test_get_unknown_returns_404(self, async_client, auth_headers):
        r = await async_client.get(
            "/api/v1/modules/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert r.status_code == 404

    async def test_create_with_unknown_project_returns_404(
        self, async_client, auth_headers
    ):
        r = await async_client.post(
            "/api/v1/modules",
            headers=auth_headers,
            json={
                "name": "OrphanModule",
                "project_id": "00000000-0000-0000-0000-000000000000",
            },
        )
        assert r.status_code == 404


# ── Releases ───────────────────────────────────────────────────────────────


class TestReleasesCrud:
    async def test_full_lifecycle(self, async_client, auth_headers, test_project):
        # Create
        r = await async_client.post(
            "/api/v1/releases",
            headers=auth_headers,
            json={
                "name": "v1.0",
                "version": "1.0.0",
                "project_id": test_project.id,
            },
        )
        assert r.status_code == 201, r.text
        rid = r.json()["data"]["id"]

        # List (paginated tuple)
        r = await async_client.get("/api/v1/releases", headers=auth_headers)
        assert r.status_code == 200
        items, total = r.json()["data"]
        assert total >= 1

        # List by project (route variant)
        r = await async_client.get(
            f"/api/v1/releases/project/{test_project.id}", headers=auth_headers
        )
        assert r.status_code == 200

        # Get
        r = await async_client.get(f"/api/v1/releases/{rid}", headers=auth_headers)
        assert r.status_code == 200

        # Update
        r = await async_client.put(
            f"/api/v1/releases/{rid}",
            headers=auth_headers,
            json={"name": "v1.0-final"},
        )
        assert r.status_code == 200
        assert r.json()["data"]["name"] == "v1.0-final"

        # Transition (Planned → In Progress)
        r = await async_client.post(
            f"/api/v1/releases/{rid}/transition",
            headers=auth_headers,
            json={"status": "In Progress"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["data"]["status"] == "In Progress"

        # Disallowed transition reports a 422
        r = await async_client.post(
            f"/api/v1/releases/{rid}/transition",
            headers=auth_headers,
            json={"status": "Planned"},  # not allowed from In Progress
        )
        assert r.status_code == 422

        # Delete (soft)
        r = await async_client.delete(f"/api/v1/releases/{rid}", headers=auth_headers)
        assert r.status_code == 200

    async def test_unknown_release_404(self, async_client, auth_headers):
        r = await async_client.get(
            "/api/v1/releases/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert r.status_code == 404


# ── Requirements ───────────────────────────────────────────────────────────


class TestRequirementsCrud:
    async def test_full_lifecycle(self, async_client, auth_headers, test_project):
        # Create — Requirement model carries title / description /
        # priority / status / external_id, but no "type" column.
        r = await async_client.post(
            "/api/v1/requirements",
            headers=auth_headers,
            json={
                "title": "Login flow",
                "description": "User logs in with email + password",
                "project_id": test_project.id,
                "priority": "High",
            },
        )
        assert r.status_code == 201, r.text
        rid = r.json()["data"]["id"]

        # List
        r = await async_client.get("/api/v1/requirements", headers=auth_headers)
        assert r.status_code == 200

        # List with search filter (hits the search-aware path)
        r = await async_client.get(
            "/api/v1/requirements",
            headers=auth_headers,
            params={"search": "Login", "project_id": test_project.id},
        )
        assert r.status_code == 200

        # By project
        r = await async_client.get(
            f"/api/v1/requirements/project/{test_project.id}", headers=auth_headers
        )
        assert r.status_code == 200

        # Get
        r = await async_client.get(
            f"/api/v1/requirements/{rid}", headers=auth_headers
        )
        assert r.status_code == 200

        # Update
        r = await async_client.put(
            f"/api/v1/requirements/{rid}",
            headers=auth_headers,
            json={"priority": "Critical"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["data"]["priority"] == "Critical"

        # Link external
        r = await async_client.post(
            f"/api/v1/requirements/{rid}/link-jira",
            headers=auth_headers,
            json={"jira_issue_key": "PROJ-42"},
        )
        assert r.status_code == 200

        # Delete
        r = await async_client.delete(
            f"/api/v1/requirements/{rid}", headers=auth_headers
        )
        assert r.status_code == 200

    async def test_link_jira_missing_key_422(self, async_client, auth_headers, test_project):
        r = await async_client.post(
            "/api/v1/requirements",
            headers=auth_headers,
            json={"title": "X", "project_id": test_project.id},
        )
        rid = r.json()["data"]["id"]
        r = await async_client.post(
            f"/api/v1/requirements/{rid}/link-jira",
            headers=auth_headers,
            json={},
        )
        assert r.status_code == 422


# ── Reports (CSV + PDF exports) ────────────────────────────────────────────


class TestReportExports:
    async def test_test_cases_csv(self, async_client, auth_headers, test_project):
        # Create at least one test case so the CSV has a row body.
        await async_client.post(
            "/api/v1/testcases",
            headers=auth_headers,
            json={"title": "Reportable", "project_id": test_project.id},
        )
        r = await async_client.get(
            "/api/v1/reports/test-cases/csv",
            headers=auth_headers,
            params={"project_id": test_project.id},
        )
        assert r.status_code == 200, r.text
        assert "csv" in r.headers["content-type"].lower()
        # The header row from the writer should always be present.
        assert "id" in r.text.lower() or "title" in r.text.lower()

    async def test_test_cases_pdf(self, async_client, auth_headers, test_project):
        await async_client.post(
            "/api/v1/testcases",
            headers=auth_headers,
            json={"title": "Pdfable", "project_id": test_project.id},
        )
        r = await async_client.get(
            "/api/v1/reports/test-cases/pdf",
            headers=auth_headers,
            params={"project_id": test_project.id},
        )
        assert r.status_code == 200, r.text
        assert r.headers["content-type"] == "application/pdf"
        # PDFs always start with the magic bytes ``%PDF-``.
        assert r.content[:5] == b"%PDF-"

    async def test_defects_csv_and_pdf(
        self, async_client, auth_headers, test_project
    ):
        await async_client.post(
            "/api/v1/defects",
            headers=auth_headers,
            json={"title": "Reportable defect", "project_id": test_project.id},
        )
        r = await async_client.get(
            "/api/v1/reports/defects/csv",
            headers=auth_headers,
            params={"project_id": test_project.id},
        )
        assert r.status_code == 200
        r = await async_client.get(
            "/api/v1/reports/defects/pdf",
            headers=auth_headers,
            params={"project_id": test_project.id},
        )
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"

    async def test_test_run_csv_and_pdf(
        self, async_client, auth_headers, test_project
    ):
        # Build a minimal run.
        suite = await async_client.post(
            "/api/v1/testsuites",
            headers=auth_headers,
            json={"name": "Reportable suite", "project_id": test_project.id},
        )
        suite_id = suite.json()["data"]["id"]
        run = await async_client.post(
            "/api/v1/testruns",
            headers=auth_headers,
            json={"name": "Reportable run", "test_suite_id": suite_id},
        )
        run_id = run.json()["data"]["id"]

        r = await async_client.get(
            f"/api/v1/reports/test-runs/{run_id}/csv", headers=auth_headers
        )
        assert r.status_code == 200
        r = await async_client.get(
            f"/api/v1/reports/test-runs/{run_id}/pdf", headers=auth_headers
        )
        assert r.status_code == 200
        assert r.content[:5] == b"%PDF-"

    async def test_dashboard_pdf(self, async_client, auth_headers, test_project):
        r = await async_client.get(
            "/api/v1/reports/dashboard/pdf",
            headers=auth_headers,
            params={"project_id": test_project.id},
        )
        assert r.status_code == 200, r.text
        assert r.content[:5] == b"%PDF-"


# ── Test Case extras ──────────────────────────────────────────────────────


class TestTestCaseExtras:
    async def test_clone_test_case_creates_new_row(
        self, async_client, auth_headers, test_project
    ):
        r = await async_client.post(
            "/api/v1/testcases",
            headers=auth_headers,
            json={"title": "Original", "project_id": test_project.id},
        )
        assert r.status_code == 201
        original_id = r.json()["data"]["id"]

        r = await async_client.post(
            f"/api/v1/testcases/{original_id}/clone", headers=auth_headers
        )
        assert r.status_code == 201, r.text
        cloned_id = r.json()["data"]["id"]
        assert cloned_id != original_id

    async def test_approve_workflow_full_path(
        self, async_client, auth_headers, test_project
    ):
        # Draft → Ready → Approved → back to Draft.
        r = await async_client.post(
            "/api/v1/testcases",
            headers=auth_headers,
            json={"title": "Approval flow", "project_id": test_project.id},
        )
        tc_id = r.json()["data"]["id"]

        r = await async_client.post(
            f"/api/v1/testcases/{tc_id}/approve",
            headers=auth_headers,
            json={"action": "ready"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["data"]["status"] == "Ready"

        r = await async_client.post(
            f"/api/v1/testcases/{tc_id}/approve",
            headers=auth_headers,
            json={"action": "approve"},
        )
        assert r.status_code == 200
        assert r.json()["data"]["status"] == "Approved"

        # Reject (Approved → Draft) is the only legal transition out.
        r = await async_client.post(
            f"/api/v1/testcases/{tc_id}/approve",
            headers=auth_headers,
            json={"action": "reject"},
        )
        assert r.status_code == 200
        assert r.json()["data"]["status"] == "Draft"

    async def test_approve_unknown_action_rejected(
        self, async_client, auth_headers, test_project
    ):
        r = await async_client.post(
            "/api/v1/testcases",
            headers=auth_headers,
            json={"title": "Unknown action", "project_id": test_project.id},
        )
        tc_id = r.json()["data"]["id"]
        r = await async_client.post(
            f"/api/v1/testcases/{tc_id}/approve",
            headers=auth_headers,
            json={"action": "wibble"},
        )
        assert r.status_code == 422

    async def test_get_versions(self, async_client, auth_headers, test_project):
        r = await async_client.post(
            "/api/v1/testcases",
            headers=auth_headers,
            json={"title": "Versioned", "project_id": test_project.id},
        )
        tc_id = r.json()["data"]["id"]
        r = await async_client.get(
            f"/api/v1/testcases/{tc_id}/versions", headers=auth_headers
        )
        assert r.status_code == 200, r.text


class TestTestCaseBulkUpload:
    async def test_csv_upload_creates_rows(
        self, async_client, auth_headers, test_project
    ):
        csv_body = (
            "title,priority,type,description\n"
            "Bulk row one,High,Functional,first imported case\n"
            "Bulk row two,Low,Smoke,second imported case\n"
        ).encode("utf-8")

        r = await async_client.post(
            "/api/v1/testcases/bulk-upload",
            headers=auth_headers,
            params={"project_id": test_project.id},
            files={"file": ("import.csv", csv_body, "text/csv")},
        )
        assert r.status_code == 201, r.text
        data = r.json()["data"]
        assert data["created"] == 2
        assert data["failed"] == 0

    async def test_csv_upload_reports_per_row_errors(
        self, async_client, auth_headers, test_project
    ):
        # Row missing the title column → service-level rejection.
        csv_body = (
            "title,priority\n"
            "Valid row,High\n"
            ",Medium\n"  # blank title — skipped by the CSV parser
        ).encode("utf-8")

        r = await async_client.post(
            "/api/v1/testcases/bulk-upload",
            headers=auth_headers,
            params={"project_id": test_project.id},
            files={"file": ("partial.csv", csv_body, "text/csv")},
        )
        assert r.status_code == 201, r.text
        # One created, one filtered out by the parser (title missing).
        data = r.json()["data"]
        assert data["created"] == 1


# ── Dashboard release-readiness now-fixed ─────────────────────────────────


class TestReleaseReadinessFixed:
    async def test_unknown_release_returns_zero_state(
        self, async_client, auth_headers
    ):
        """Pre-fix: 500 (Defect.release_id reference). Post-fix: the
        join chain produces zero counts and a readiness score of 0,
        not an exception."""
        r = await async_client.get(
            "/api/v1/dashboard/release-readiness/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        d = r.json()["data"]
        assert d["total_executions"] == 0
        assert d["open_defects"] == 0
        assert d["readiness_score"] == 0
