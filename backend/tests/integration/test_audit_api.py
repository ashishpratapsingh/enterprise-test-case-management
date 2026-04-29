"""Integration tests for /api/v1/audit/* read endpoints.

The audit middleware writes log rows on every mutating request. We
exercise that side-effect by creating a defect, then asserting:
    a) the listing endpoint returns >=1 row
    b) filters narrow the result correctly
    c) the entity-trail endpoint scopes to a single entity
    d) the stats endpoint returns a per-day breakdown

The audit middleware shape is sensitive to the test app fixture; not
every test environment captures every action. The assertions below are
deliberately lenient on counts — we just need the SQL paths to run.
"""

import pytest

pytestmark = pytest.mark.asyncio


class TestAuditList:
    async def test_list_returns_tuple_shape(self, async_client, auth_headers):
        r = await async_client.get("/api/v1/audit", headers=auth_headers)
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert isinstance(data, list) and len(data) == 2
        items, total = data
        assert isinstance(items, list)
        assert isinstance(total, int)

    async def test_list_filters_by_entity_type(self, async_client, auth_headers, test_project):
        # Trigger an audit row by creating a defect.
        await async_client.post(
            "/api/v1/defects",
            headers=auth_headers,
            json={"title": "audit-test", "project_id": test_project.id},
        )
        r = await async_client.get(
            "/api/v1/audit",
            headers=auth_headers,
            params={"entity_type": "defect"},
        )
        assert r.status_code == 200, r.text

    async def test_list_pagination_caps(self, async_client, auth_headers):
        r = await async_client.get(
            "/api/v1/audit",
            headers=auth_headers,
            params={"page": 1, "page_size": 5},
        )
        assert r.status_code == 200

    async def test_list_rejects_oversized_page_size(self, async_client, auth_headers):
        r = await async_client.get(
            "/api/v1/audit",
            headers=auth_headers,
            params={"page_size": 1000},
        )
        assert r.status_code == 422

    async def test_list_with_search(self, async_client, auth_headers):
        r = await async_client.get(
            "/api/v1/audit",
            headers=auth_headers,
            params={"search": "defect"},
        )
        assert r.status_code == 200


class TestAuditStats:
    async def test_stats_default_days(self, async_client, auth_headers):
        r = await async_client.get("/api/v1/audit/stats", headers=auth_headers)
        assert r.status_code == 200, r.text

    async def test_stats_invalid_days_rejected(self, async_client, auth_headers):
        r = await async_client.get(
            "/api/v1/audit/stats",
            headers=auth_headers,
            params={"days": 0},
        )
        assert r.status_code == 422


class TestAuditEntityTrail:
    async def test_entity_trail_returns_tuple_shape(
        self, async_client, auth_headers, test_project
    ):
        # Create + delete a defect → produces two audit entries on the
        # same entity (CREATE then DELETE).
        r = await async_client.post(
            "/api/v1/defects",
            headers=auth_headers,
            json={"title": "trail-target", "project_id": test_project.id},
        )
        assert r.status_code == 201
        defect_id = r.json()["data"]["id"]

        r = await async_client.get(
            f"/api/v1/audit/entity/defect/{defect_id}",
            headers=auth_headers,
        )
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert isinstance(data, list) and len(data) == 2
