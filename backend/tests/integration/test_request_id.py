"""Integration tests for the X-Request-ID middleware."""

import pytest

pytestmark = pytest.mark.asyncio


class TestRequestID:
    async def test_response_includes_generated_request_id(self, async_client):
        """When the caller sends no X-Request-ID, the middleware
        generates a fresh one and echoes it back."""
        r = await async_client.get("/livez")
        assert r.status_code == 200
        rid = r.headers.get("X-Request-ID")
        assert rid is not None
        assert len(rid) >= 16  # uuid hex is 32 chars

    async def test_response_echoes_caller_supplied_request_id(self, async_client):
        """A caller-supplied id (typically from a load balancer or
        tracing layer) is preserved end-to-end."""
        r = await async_client.get(
            "/livez", headers={"X-Request-ID": "trace-abc-123"}
        )
        assert r.status_code == 200
        assert r.headers["X-Request-ID"] == "trace-abc-123"

    async def test_overlong_caller_supplied_id_replaced(self, async_client):
        """Bound the field length to avoid log-injection / huge
        header attacks. >128 chars → middleware generates a fresh id
        instead."""
        bogus = "x" * 200
        r = await async_client.get(
            "/livez", headers={"X-Request-ID": bogus}
        )
        assert r.status_code == 200
        assert r.headers["X-Request-ID"] != bogus

    async def test_each_request_gets_a_distinct_id(self, async_client):
        """Sanity: two consecutive requests without a supplied id
        must end up with different generated ids."""
        a = await async_client.get("/livez")
        b = await async_client.get("/livez")
        assert a.headers["X-Request-ID"] != b.headers["X-Request-ID"]
