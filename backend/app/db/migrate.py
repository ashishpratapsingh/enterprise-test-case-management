"""Lightweight dev schema migrations for SQLite.

Adds columns that were introduced after the initial schema was seeded,
so existing tcm.db files keep working without a full drop/reseed.
"""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

# (table, column, sql column definition)
_COLUMN_ADDITIONS: list[tuple[str, str, str]] = [
    ("defects", "test_execution_id", "VARCHAR(36)"),
    ("defects", "step_number", "INTEGER"),
]


async def ensure_columns(engine: AsyncEngine) -> None:
    """Add any missing columns listed in _COLUMN_ADDITIONS (SQLite-safe).

    Also enables WAL journal mode + a busy-timeout so the audit middleware can
    write concurrently with the main request session without tripping
    "database is locked" errors.
    """
    if not engine.url.get_backend_name().startswith("sqlite"):
        return

    async with engine.begin() as conn:
        await conn.execute(text("PRAGMA journal_mode=WAL"))
        await conn.execute(text("PRAGMA busy_timeout=5000"))

        for table, column, coltype in _COLUMN_ADDITIONS:
            result = await conn.execute(text(f"PRAGMA table_info('{table}')"))
            rows = result.fetchall()
            if not rows:
                continue
            existing = {row[1] for row in rows}
            if column in existing:
                continue
            await conn.execute(
                text(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}")
            )
            logger.info("schema_migration_applied", extra={"table": table, "column": column})
