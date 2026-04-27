"""Unit tests for app.utils.db_search.build_search_filter."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from sqlalchemy import Column, MetaData, String, Table

from app.utils.db_search import build_search_filter


# ── Build a model-like object for the helper to inspect ─────────────────────

_metadata = MetaData()
_t = Table(
    "fakes",
    _metadata,
    Column("id", String(36), primary_key=True),
    Column("title", String(200)),
    Column("description", String(500)),
)


class _FakeModel:
    __tablename__ = "fakes"
    title = _t.c.title
    description = _t.c.description


def _bind(dialect_name: str):
    """Mimic the AsyncSession.get_bind() return shape."""
    return SimpleNamespace(dialect=SimpleNamespace(name=dialect_name))


class TestEmptyOrInvalid:
    def test_empty_string_returns_none(self):
        assert build_search_filter(_FakeModel, "", ["title"], _bind("sqlite")) is None

    def test_whitespace_only_returns_none(self):
        assert build_search_filter(_FakeModel, "   ", ["title"], _bind("sqlite")) is None

    def test_no_valid_columns_returns_none(self):
        assert (
            build_search_filter(_FakeModel, "x", ["bogus_col"], _bind("sqlite")) is None
        )

    def test_skips_unknown_columns_but_uses_known_ones(self):
        clause = build_search_filter(
            _FakeModel, "x", ["title", "no_such_column"], _bind("sqlite")
        )
        assert clause is not None


class TestPostgresPath:
    def test_emits_websearch_to_tsquery(self):
        clause = build_search_filter(
            _FakeModel, "login crash", ["title", "description"], _bind("postgresql")
        )
        assert clause is not None
        sql = str(clause)
        assert "to_tsvector" in sql
        assert "websearch_to_tsquery" in sql
        # Both columns must be referenced.
        assert "fakes.title" in sql
        assert "fakes.description" in sql

    def test_uses_named_bindparam_for_query(self):
        clause = build_search_filter(_FakeModel, "abc", ["title"], _bind("postgresql"))
        assert clause is not None
        # The bind value must be parameterised, not interpolated, so we don't
        # have a SQL-injection surface even though we use raw text() above.
        params = clause.compile().params  # type: ignore[attr-defined]
        assert params.get("search_q") == "abc"


class TestSqliteFallback:
    def test_emits_or_of_ilike(self):
        clause = build_search_filter(
            _FakeModel, "login", ["title", "description"], _bind("sqlite")
        )
        assert clause is not None
        sql = str(clause).lower()
        assert "lower" in sql or "like" in sql  # ilike → LOWER(...) LIKE LOWER(...)
        # Both columns must be present.
        assert "title" in sql
        assert "description" in sql


class TestUnknownDialectFallsBackToLike:
    def test_unknown_dialect_uses_like_path(self):
        # An unexpected dialect name (or a missing one) must not crash —
        # the helper defaults to the SQLite/LIKE branch.
        clause = build_search_filter(_FakeModel, "x", ["title"], _bind("oracle"))
        assert clause is not None
        sql = str(clause).lower()
        assert "to_tsvector" not in sql
