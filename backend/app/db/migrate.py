"""Startup-time database bootstrap.

Two concerns handled here:

1. SQLite PRAGMAs (``journal_mode=WAL``, ``busy_timeout=5000``) so the
   audit middleware can write concurrently with the main request session
   without tripping "database is locked" errors. These are applied on
   every boot for SQLite back-ends; Postgres ignores them.

2. Schema migrations via Alembic. On boot we run ``alembic upgrade head``
   so newly-deployed environments come up with the current schema. For
   pre-existing databases that already have every table but no
   ``alembic_version`` row (e.g. an SQLite file seeded before Alembic was
   introduced), we ``stamp head`` first so Alembic doesn't try to
   re-create tables that already exist.

Alembic's stock ``env.py`` calls ``asyncio.run(...)`` internally, which
raises when invoked from an already-running event loop (i.e. the FastAPI
lifespan). To avoid that, we drive Alembic's ``MigrationContext`` directly
against the running async engine via ``AsyncConnection.run_sync(...)``.
"""

from __future__ import annotations

import logging
from pathlib import Path

from alembic.config import Config
from alembic.runtime.environment import EnvironmentContext
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine

logger = logging.getLogger(__name__)

# ``alembic.ini`` sits at the backend package root. Resolve it from this
# file's location so the app boots the same regardless of launch cwd.
_ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"


async def _apply_sqlite_pragmas(engine: AsyncEngine) -> None:
    if not engine.url.get_backend_name().startswith("sqlite"):
        return
    async with engine.begin() as conn:
        await conn.execute(text("PRAGMA journal_mode=WAL"))
        await conn.execute(text("PRAGMA busy_timeout=5000"))


async def _table_exists(engine: AsyncEngine, table_name: str) -> bool:
    async with engine.connect() as conn:
        backend = engine.url.get_backend_name()
        if backend.startswith("sqlite"):
            row = (
                await conn.execute(
                    text(
                        "SELECT name FROM sqlite_master "
                        "WHERE type='table' AND name=:n"
                    ),
                    {"n": table_name},
                )
            ).first()
        else:
            row = (
                await conn.execute(
                    text(
                        "SELECT 1 FROM information_schema.tables "
                        "WHERE table_name = :n LIMIT 1"
                    ),
                    {"n": table_name},
                )
            ).first()
        return row is not None


def _alembic_config() -> Config:
    """Load alembic.ini. The sqlalchemy.url value inside doesn't matter —
    we never use alembic's own engine factory; we pass the connection in."""
    return Config(str(_ALEMBIC_INI))


def _run_migrations_sync(sync_conn, cfg: Config, script: ScriptDirectory, head_rev: str, legacy_stamp: bool) -> None:
    """Sync worker invoked via ``conn.run_sync``.

    Drives Alembic via ``EnvironmentContext`` so the ``alembic.op`` proxy
    is wired up for migration scripts that call ``op.get_bind()``.

    When ``legacy_stamp`` is True, we only insert the head revision into
    ``alembic_version`` (no DDL) — the schema is already present from the
    pre-Alembic era. Otherwise we run the normal upgrade-to-head pathway.
    """
    def upgrade_fn(rev, _ctx):
        return script._upgrade_revs(head_rev, rev)

    with EnvironmentContext(
        cfg,
        script,
        fn=upgrade_fn,
        as_sql=False,
        destination_rev=head_rev,
    ) as env:
        env.configure(connection=sync_conn, target_metadata=None)
        if legacy_stamp:
            env.get_context().stamp(script, head_rev)
            return
        with env.begin_transaction():
            env.run_migrations()


async def _run_alembic(engine: AsyncEngine) -> None:
    """Bring the DB schema up to head, handling the legacy-schema edge."""
    cfg = _alembic_config()
    script = ScriptDirectory.from_config(cfg)
    head_rev = script.get_current_head()
    if head_rev is None:
        logger.warning("alembic_no_head_revision_found")
        return

    has_users = await _table_exists(engine, "users")
    has_version = await _table_exists(engine, "alembic_version")

    legacy_stamp = has_users and not has_version
    if legacy_stamp:
        logger.info(
            "alembic_stamping_existing_db",
            extra={"reason": "schema present without alembic_version"},
        )
    else:
        logger.info(
            "alembic_upgrade_head",
            extra={"fresh_db": not has_users, "at_version_table": has_version},
        )

    async with engine.begin() as conn:
        await conn.run_sync(
            _run_migrations_sync, cfg, script, head_rev, legacy_stamp
        )


async def ensure_columns(engine: AsyncEngine) -> None:
    """Apply SQLite pragmas and run Alembic migrations on boot.

    Kept under the historical name ``ensure_columns`` so ``app.main``'s
    lifespan call site doesn't need to change.
    """
    await _apply_sqlite_pragmas(engine)
    try:
        await _run_alembic(engine)
    except Exception:
        logger.exception("alembic_migration_failed")
        raise
