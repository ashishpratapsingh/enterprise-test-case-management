"""Snapshot entities into dicts for audit old_values / new_values fields.

Given an ``entity_type`` string (as used in the audit middleware) and an id,
returns a dict representation of the row that's safe to persist — sensitive
fields (``hashed_password``) are redacted, datetimes are ISO-serialised, and
relationship objects are skipped.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


_SENSITIVE_FIELDS = {"hashed_password", "password", "refresh_token", "access_token"}


def _resolve_model(entity_type: str):
    """Map an audit entity_type slug to its SQLAlchemy model class, or None."""
    # Late imports to avoid circular deps at module load time.
    from app.models.defect import Defect
    from app.models.epic import Epic
    from app.models.module import Module
    from app.models.project import Project
    from app.models.release import Release
    from app.models.requirement import Requirement
    from app.models.role import Role
    from app.models.test_case import TestCase
    from app.models.test_execution import TestExecution
    from app.models.test_run import TestRun
    from app.models.test_suite import TestSuite
    from app.models.user import User
    from app.models.user_story import UserStory

    mapping = {
        "user": User,
        "role": Role,
        "project": Project,
        "module": Module,
        "release": Release,
        "requirement": Requirement,
        "test_case": TestCase,
        "test_suite": TestSuite,
        "test_run": TestRun,
        "execution": TestExecution,
        "defect": Defect,
        "epic": Epic,
        "user_story": UserStory,
    }
    return mapping.get(entity_type)


def _to_primitive(value: Any) -> Any:
    """Convert SQLAlchemy values to JSON-safe primitives."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, (list, tuple, set)):
        return [_to_primitive(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _to_primitive(v) for k, v in value.items()}
    return str(value)


def _serialize(entity: Any) -> dict[str, Any]:
    """Convert an ORM object into a plain dict of column values."""
    data: dict[str, Any] = {}
    for col in entity.__table__.columns:
        name = col.key
        if name in _SENSITIVE_FIELDS:
            data[name] = "[redacted]"
            continue
        data[name] = _to_primitive(getattr(entity, name, None))
    return data


async def snapshot_entity(
    session: AsyncSession,
    entity_type: str,
    entity_id: str,
) -> dict[str, Any] | None:
    """Return a dict snapshot of the entity or None if unknown/missing."""
    model = _resolve_model(entity_type)
    if model is None:
        return None
    pk = getattr(model, "id", None)
    if pk is None:
        return None
    stmt = select(model).where(pk == entity_id)
    result = await session.execute(stmt)
    entity = result.scalar_one_or_none()
    if entity is None:
        return None
    return _serialize(entity)
