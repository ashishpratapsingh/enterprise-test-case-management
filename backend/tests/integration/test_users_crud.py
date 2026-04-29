"""Integration tests for the per-row /api/v1/users/* endpoints.

The bulk endpoints already have their own test file. This one covers
the per-row CRUD, status toggles, password reset, and self-service
password change — paths that were previously uncovered.
"""

import uuid

import pytest

pytestmark = pytest.mark.asyncio


async def _create_user(async_client, auth_headers, role_id, **overrides) -> str:
    body = {
        "email": overrides.get("email", f"u-{uuid.uuid4().hex[:8]}@example.com"),
        "full_name": overrides.get("full_name", "CRUD Test User"),
        "password": overrides.get("password", "Strong@123"),
        "role_id": role_id,
        "is_active": overrides.get("is_active", True),
    }
    r = await async_client.post("/api/v1/users", headers=auth_headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


class TestListAndGet:
    async def test_list_with_filters(self, async_client, auth_headers, test_role):
        await _create_user(async_client, auth_headers, test_role.id, full_name="Alice")
        await _create_user(async_client, auth_headers, test_role.id, full_name="Bob")

        # Search.
        r = await async_client.get(
            "/api/v1/users", headers=auth_headers, params={"search": "Alice"}
        )
        assert r.status_code == 200, r.text

        # Filter by role.
        r = await async_client.get(
            "/api/v1/users",
            headers=auth_headers,
            params={"role_id": test_role.id},
        )
        assert r.status_code == 200

        # Filter by is_active.
        r = await async_client.get(
            "/api/v1/users", headers=auth_headers, params={"is_active": True}
        )
        assert r.status_code == 200

    async def test_pagination_caps(self, async_client, auth_headers):
        r = await async_client.get(
            "/api/v1/users", headers=auth_headers, params={"page_size": 1000}
        )
        assert r.status_code == 422

    async def test_get_me_returns_current_user(self, async_client, auth_headers, test_user):
        r = await async_client.get("/api/v1/users/me", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["data"]["email"] == test_user.email

    async def test_get_unknown_user_returns_404(self, async_client, auth_headers):
        r = await async_client.get(
            "/api/v1/users/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert r.status_code == 404


class TestUpdate:
    async def test_update_user_changes_full_name(
        self, async_client, auth_headers, test_role
    ):
        uid = await _create_user(async_client, auth_headers, test_role.id, full_name="Old")
        r = await async_client.put(
            f"/api/v1/users/{uid}",
            headers=auth_headers,
            json={"full_name": "New Name"},
        )
        assert r.status_code == 200, r.text
        assert r.json()["data"]["full_name"] == "New Name"

    async def test_update_unknown_user_returns_404(self, async_client, auth_headers):
        r = await async_client.put(
            "/api/v1/users/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
            json={"full_name": "x"},
        )
        assert r.status_code == 404


class TestActivateDeactivate:
    async def test_deactivate_then_activate(
        self, async_client, auth_headers, test_role
    ):
        uid = await _create_user(async_client, auth_headers, test_role.id, full_name="Toggle")
        r = await async_client.post(
            f"/api/v1/users/{uid}/deactivate", headers=auth_headers
        )
        assert r.status_code == 200, r.text
        r = await async_client.get(f"/api/v1/users/{uid}", headers=auth_headers)
        assert r.json()["data"]["is_active"] is False

        r = await async_client.post(
            f"/api/v1/users/{uid}/activate", headers=auth_headers
        )
        assert r.status_code == 200
        r = await async_client.get(f"/api/v1/users/{uid}", headers=auth_headers)
        assert r.json()["data"]["is_active"] is True

    async def test_cannot_deactivate_self(
        self, async_client, auth_headers, test_user
    ):
        r = await async_client.post(
            f"/api/v1/users/{test_user.id}/deactivate", headers=auth_headers
        )
        assert r.status_code == 422


class TestPassword:
    async def test_admin_reset_password(self, async_client, auth_headers, test_role):
        uid = await _create_user(async_client, auth_headers, test_role.id, full_name="PWUser")
        r = await async_client.post(
            f"/api/v1/users/{uid}/reset-password",
            headers=auth_headers,
            json={"new_password": "Brand@New1"},
        )
        assert r.status_code == 200, r.text

    async def test_change_my_password_requires_current(
        self, async_client, auth_headers
    ):
        # Wrong current → 401/422 from validation/auth.
        r = await async_client.post(
            "/api/v1/users/me/change-password",
            headers=auth_headers,
            json={"current_password": "wrong", "new_password": "AnotherStrong@1"},
        )
        assert r.status_code in (400, 401, 422)

    async def test_change_my_password_with_correct_current(
        self, async_client, auth_headers, test_user
    ):
        # The conftest seed sets test_user.password = "Test@1234".
        r = await async_client.post(
            "/api/v1/users/me/change-password",
            headers=auth_headers,
            json={"current_password": "Test@1234", "new_password": "AnotherStrong@1"},
        )
        assert r.status_code == 200, r.text


class TestDelete:
    async def test_delete_user(self, async_client, auth_headers, test_role):
        uid = await _create_user(async_client, auth_headers, test_role.id, full_name="ToDelete")
        r = await async_client.delete(f"/api/v1/users/{uid}", headers=auth_headers)
        assert r.status_code == 200, r.text
        # Subsequent GET must 404 (soft-deleted).
        r = await async_client.get(f"/api/v1/users/{uid}", headers=auth_headers)
        assert r.status_code == 404

    async def test_cannot_delete_self(self, async_client, auth_headers, test_user):
        r = await async_client.delete(
            f"/api/v1/users/{test_user.id}", headers=auth_headers
        )
        assert r.status_code == 422
