"""Integration tests for /api/v1/roles CRUD."""

import pytest

pytestmark = pytest.mark.asyncio


class TestListRoles:
    async def test_authenticated_user_can_list_roles(
        self, async_client, auth_headers, test_role
    ):
        r = await async_client.get("/api/v1/roles", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()["data"]
        # The seeded test role must appear.
        assert any(role["name"] == test_role.name for role in data)


class TestCreateRole:
    async def test_admin_can_create_role(self, async_client, auth_headers):
        r = await async_client.post(
            "/api/v1/roles",
            headers=auth_headers,
            json={
                "name": "QA Lead",
                "description": "Senior QA",
                "permissions": {"test_cases": ["create", "read", "update"]},
            },
        )
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["data"]["name"] == "QA Lead"
        assert body["data"]["permissions"] == {
            "test_cases": ["create", "read", "update"]
        }

    async def test_duplicate_name_returns_409(self, async_client, auth_headers, test_role):
        r = await async_client.post(
            "/api/v1/roles",
            headers=auth_headers,
            json={"name": test_role.name, "description": "dup"},
        )
        assert r.status_code == 409

    async def test_missing_name_returns_422(self, async_client, auth_headers):
        r = await async_client.post(
            "/api/v1/roles",
            headers=auth_headers,
            json={"description": "no name"},
        )
        assert r.status_code == 422


class TestUpdateRole:
    async def test_admin_can_update_role(self, async_client, auth_headers):
        # Create one first.
        c = await async_client.post(
            "/api/v1/roles",
            headers=auth_headers,
            json={"name": "Temp Role", "description": "v1"},
        )
        rid = c.json()["data"]["id"]

        r = await async_client.put(
            f"/api/v1/roles/{rid}",
            headers=auth_headers,
            json={"description": "v2", "permissions": {"reports": ["read"]}},
        )
        assert r.status_code == 200
        assert r.json()["data"]["description"] == "v2"
        assert r.json()["data"]["permissions"] == {"reports": ["read"]}
        # Name unchanged when not provided.
        assert r.json()["data"]["name"] == "Temp Role"

    async def test_update_missing_role_returns_404(self, async_client, auth_headers):
        r = await async_client.put(
            "/api/v1/roles/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
            json={"description": "x"},
        )
        assert r.status_code == 404

    async def test_rename_to_duplicate_returns_409(
        self, async_client, auth_headers, test_role
    ):
        c = await async_client.post(
            "/api/v1/roles",
            headers=auth_headers,
            json={"name": "Some Other Role"},
        )
        rid = c.json()["data"]["id"]

        # Try to rename to the existing test_role's name.
        r = await async_client.put(
            f"/api/v1/roles/{rid}",
            headers=auth_headers,
            json={"name": test_role.name},
        )
        assert r.status_code == 409


class TestDeleteRole:
    async def test_admin_can_delete_unused_role(self, async_client, auth_headers):
        c = await async_client.post(
            "/api/v1/roles",
            headers=auth_headers,
            json={"name": "Throwaway"},
        )
        rid = c.json()["data"]["id"]

        r = await async_client.delete(
            f"/api/v1/roles/{rid}", headers=auth_headers
        )
        assert r.status_code == 200

        # And it disappears from the list.
        listing = await async_client.get("/api/v1/roles", headers=auth_headers)
        names = [role["name"] for role in listing.json()["data"]]
        assert "Throwaway" not in names

    async def test_cannot_delete_role_in_use(
        self, async_client, auth_headers, test_user, test_role
    ):
        # test_user references test_role — deletion must be blocked.
        r = await async_client.delete(
            f"/api/v1/roles/{test_role.id}", headers=auth_headers
        )
        assert r.status_code == 409
        assert "still assigned" in r.text.lower()

    async def test_delete_missing_returns_404(self, async_client, auth_headers):
        r = await async_client.delete(
            "/api/v1/roles/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert r.status_code == 404
