"""Integration tests for /livez, /readyz, and the /health alias.

The probes don't need authentication — load balancers and k8s
neither sign requests nor follow our API prefix, so they live at the
process root.
"""

import pytest

pytestmark = pytest.mark.asyncio


class TestLiveness:
    async def test_livez_returns_200(self, async_client):
        r = await async_client.get("/livez")
        assert r.status_code == 200
        assert r.json()["data"]["status"] == "alive"

    async def test_health_is_alias_of_livez(self, async_client):
        """/health is kept around so older monitors / k8s manifests
        keep working without a redeploy."""
        r = await async_client.get("/health")
        assert r.status_code == 200
        assert r.json()["success"] is True


class TestReadiness:
    async def test_readyz_returns_200_with_per_check_breakdown(self, async_client):
        """All checks should pass against the in-memory test DB."""
        r = await async_client.get("/readyz")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["data"]["status"] == "ready"
        assert body["data"]["checks"]["database"]["status"] == "ok"
        assert body["data"]["checks"]["secret_key"]["status"] == "ok"

    async def test_readyz_reports_db_failure_as_503(self, async_client, monkeypatch):
        """When the DB engine raises on connect, /readyz must return
        503 and surface which dependency failed — separate from
        /livez, which stays 200 because the *process* is fine."""
        import app.main as main_module

        class _Boom:
            async def __aenter__(self):
                raise RuntimeError("simulated DB outage")
            async def __aexit__(self, *a):
                return False

        class _FakeEngine:
            def connect(self):
                return _Boom()

        # AsyncEngine.connect is read-only, so swap the whole engine
        # symbol in main's namespace instead.
        monkeypatch.setattr(main_module, "engine", _FakeEngine())

        r = await async_client.get("/readyz")
        assert r.status_code == 503
        body = r.json()
        assert body["data"]["status"] == "not_ready"
        assert body["data"]["checks"]["database"]["status"] == "error"
        assert "simulated DB outage" in body["data"]["checks"]["database"]["error"]

        # /livez stays green — that's the whole point of the split.
        live = await async_client.get("/livez")
        assert live.status_code == 200
