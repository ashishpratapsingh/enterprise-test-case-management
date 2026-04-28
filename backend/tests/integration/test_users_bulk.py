"""Integration tests for /api/v1/users bulk operations.

Self-protection rules carry over from the per-row admin endpoints:
the requesting admin cannot deactivate / role-change / delete
themselves. Those rows land in ``failed``, the rest succeed.
"""

import uuid

import pytest

pytestmark = pytest.mark.asyncio


async def _create_user(async_client, auth_headers, role_id, **overrides) -> str:
    body = {
        "email": overrides.get("email", f"u-{uuid.uuid4().hex[:8]}@example.com"),
        "full_name": overrides.get("full_name", "Bulk Test User"),
        "password": overrides.get("password", "Strong@123"),
        "role_id": role_id,
        "is_active": overrides.get("is_active", True),
    }
    r = await async_client.post("/api/v1/users", headers=auth_headers, json=body)
    assert r.status_code == 201, r.text
    return r.json()["data"]["id"]


class TestBulkSetActive:
    async def test_deactivates_then_reactivates(
        self, async_client, auth_headers, test_role
    ):
        u1 = await _create_user(async_client, auth_headers, test_role.id, full_name="A1")
        u2 = await _create_user(async_client, auth_headers, test_role.id, full_name="A2")

        r = await async_client.post(
            "/api/v1/users/bulk-set-active",
            headers=auth_headers,
            json={"ids": [u1, u2], "is_active": False},
        )
        assert r.status_code == 200, r.text
        assert sorted(r.json()["data"]["succeeded"]) == sorted([u1, u2])

        for uid in (u1, u2):
            view = await async_client.get(f"/api/v1/users/{uid}", headers=auth_headers)
            assert view.json()["data"]["is_active"] is False

        # Reactivate.
        r = await async_client.post(
            "/api/v1/users/bulk-set-active",
            headers=auth_headers,
            json={"ids": [u1, u2], "is_active": True},
        )
        assert r.status_code == 200
        for uid in (u1, u2):
            view = await async_client.get(f"/api/v1/users/{uid}", headers=auth_headers)
            assert view.json()["data"]["is_active"] is True

    async def test_cannot_deactivate_self(
        self, async_client, auth_headers, test_user, test_role
    ):
        """Self-protection: the admin's own ID lands in `failed`,
        the other user still gets deactivated."""
        other = await _create_user(async_client, auth_headers, test_role.id, full_name="Other")

        r = await async_client.post(
            "/api/v1/users/bulk-set-active",
            headers=auth_headers,
            json={"ids": [str(test_user.id), other], "is_active": False},
        )
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["succeeded"] == [other]
        assert len(data["failed"]) == 1
        assert data["failed"][0]["id"] == str(test_user.id)


class TestBulkSetRole:
    async def test_reassigns_role(
        self, async_client, auth_headers, test_role, db_session
    ):
        # Create a second role to reassign to.
        from app.models.role import Role
        new_role = Role(
            id=str(uuid.uuid4()),
            name="QA Engineer",
            description="Bulk-test target role",
            permissions={},
        )
        db_session.add(new_role)
        await db_session.flush()

        u1 = await _create_user(async_client, auth_headers, test_role.id, full_name="R1")
        u2 = await _create_user(async_client, auth_headers, test_role.id, full_name="R2")

        r = await async_client.post(
            "/api/v1/users/bulk-set-role",
            headers=auth_headers,
            json={"ids": [u1, u2], "role_id": new_role.id},
        )
        assert r.status_code == 200, r.text
        assert sorted(r.json()["data"]["succeeded"]) == sorted([u1, u2])

        for uid in (u1, u2):
            view = await async_client.get(f"/api/v1/users/{uid}", headers=auth_headers)
            assert view.json()["data"]["role_id"] == new_role.id

    async def test_unknown_role_returns_422(
        self, async_client, auth_headers, test_role
    ):
        u1 = await _create_user(async_client, auth_headers, test_role.id, full_name="R3")
        r = await async_client.post(
            "/api/v1/users/bulk-set-role",
            headers=auth_headers,
            json={"ids": [u1], "role_id": "00000000-0000-0000-0000-000000000000"},
        )
        assert r.status_code == 422

    async def test_cannot_change_own_role(
        self, async_client, auth_headers, test_user, test_role, db_session
    ):
        from app.models.role import Role
        new_role = Role(
            id=str(uuid.uuid4()),
            name="Viewer",
            description="Bulk-test viewer role",
            permissions={},
        )
        db_session.add(new_role)
        await db_session.flush()

        other = await _create_user(async_client, auth_headers, test_role.id, full_name="O1")

        r = await async_client.post(
            "/api/v1/users/bulk-set-role",
            headers=auth_headers,
            json={"ids": [str(test_user.id), other], "role_id": new_role.id},
        )
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert data["succeeded"] == [other]
        assert len(data["failed"]) == 1
        assert data["failed"][0]["id"] == str(test_user.id)


class TestBulkDelete:
    async def test_deletes_existing_and_reports_self(
        self, async_client, auth_headers, test_user, test_role
    ):
        u1 = await _create_user(async_client, auth_headers, test_role.id, full_name="D1")
        u2 = await _create_user(async_client, auth_headers, test_role.id, full_name="D2")

        r = await async_client.post(
            "/api/v1/users/bulk-delete",
            headers=auth_headers,
            json={"ids": [u1, u2, str(test_user.id)]},
        )
        assert r.status_code == 200, r.text
        data = r.json()["data"]
        assert sorted(data["succeeded"]) == sorted([u1, u2])
        assert len(data["failed"]) == 1
        assert data["failed"][0]["id"] == str(test_user.id)

    async def test_empty_ids_is_validation_error(self, async_client, auth_headers):
        r = await async_client.post(
            "/api/v1/users/bulk-delete",
            headers=auth_headers,
            json={"ids": []},
        )
        assert r.status_code == 422
