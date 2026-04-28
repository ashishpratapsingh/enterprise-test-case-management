"""Dialect-aware search-filter builder.

The list endpoints accept a free-text ``search`` query param that should
match across multiple text columns (e.g. title + description).

* On Postgres we use ``websearch_to_tsquery`` against an on-the-fly
  ``to_tsvector`` of the concatenated columns. This gives us proper
  full-text search semantics — stop-word filtering, stemming
  ("login" matches "logging"), phrase queries (`"login crash"`),
  negation (`login -mobile`), and OR (`login OR signup`).

  No precomputed ``search_vector`` column or GIN index is required for
  correctness, but a follow-up migration would add one for performance
  on large tables. Until then the planner falls back to a sequential
  scan, which is fine up to ~100k rows.

* On SQLite (used in local dev + the test suite) we fall back to
  case-insensitive ``LIKE`` against each column, OR'd together. This
  preserves the historical behaviour, so existing integration tests
  keep working unchanged.

The function returns a ``ColumnElement`` that callers OR / AND into
their existing WHERE clause.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import ColumnElement, or_, text
from sqlalchemy.engine import Engine

# Type alias: anything that exposes a ``.dialect`` attribute. ``AsyncSession``
# does, via ``session.get_bind()`` returning an Engine.


def _dialect_name(bind: Any) -> str:
    """Best-effort dialect-name extraction. Defaults to ``sqlite`` so the
    LIKE fallback fires when the bind shape is unexpected."""
    dialect = getattr(bind, "dialect", None)
    if dialect is None:
        return "sqlite"
    return getattr(dialect, "name", "sqlite") or "sqlite"


def build_search_filter(
    model: Any,
    search_text: str,
    columns: list[str],
    bind: Engine | Any,
) -> ColumnElement | None:
    """Return a search WHERE-clause for ``model`` against ``columns``.

    ``columns`` is a list of attribute names on ``model``. Any column that
    doesn't exist is silently skipped. Returns ``None`` if the search text
    is empty or no valid columns are given.
    """
    if not search_text or not search_text.strip():
        return None
    valid = [c for c in columns if hasattr(model, c)]
    if not valid:
        return None

    dialect = _dialect_name(bind)
    if dialect == "postgresql":
        # Build: to_tsvector('english', coalesce(t.col1,'') || ' ' || coalesce(t.col2,''))
        # @@ websearch_to_tsquery('english', :q)
        table = model.__tablename__
        coalesced = " || ' ' || ".join(
            f"coalesce({table}.{c}::text, '')" for c in valid
        )
        return text(
            f"to_tsvector('english', {coalesced}) "
            "@@ websearch_to_tsquery('english', :search_q)"
        ).bindparams(search_q=search_text)

    # Default: SQLite (and any other dialect) — case-insensitive substring.
    pattern = f"%{search_text}%"
    return or_(*[getattr(model, c).ilike(pattern) for c in valid])
