"""initial_schema

Revision ID: 6d4e3cac53e0
Revises:
Create Date: 2026-04-24 10:02:16.014160+00:00

Baseline migration representing the entire schema as of the Milestone-1
cut-over from the legacy ``ensure_columns`` lightweight migrator.

We use ``Base.metadata.create_all`` / ``drop_all`` here instead of hand-
writing every ``op.create_table`` call because:

* SQLAlchemy sorts tables topologically (parents before children),
  avoiding the FK-ordering failures that Alembic's alphabetical
  autogenerate produced on Postgres.
* There is a genuine cycle between ``defects`` and ``test_executions``
  (each has an FK to the other). SQLAlchemy's ``create_all`` knows how
  to break such cycles with deferred ``ALTER TABLE`` statements where
  the dialect requires it; hand-written ``op.create_foreign_key`` calls
  would have to replicate that per dialect.

Subsequent migrations are expected to be generated with
``alembic revision --autogenerate`` and will be hand-reviewed column-
level diffs — the fragile bit is only this initial baseline.
"""

from typing import Sequence, Union

from alembic import op

from app.db.base import Base

# Import every model module so Base.metadata is fully populated before
# we call create_all/drop_all. Ordering here does not matter — only
# that each import runs.
import app.models.attachment  # noqa: F401
import app.models.audit_log  # noqa: F401
import app.models.defect  # noqa: F401
import app.models.epic  # noqa: F401
import app.models.module  # noqa: F401
import app.models.project  # noqa: F401
import app.models.release  # noqa: F401
import app.models.requirement  # noqa: F401
import app.models.role  # noqa: F401
import app.models.test_case  # noqa: F401
import app.models.test_case_version  # noqa: F401
import app.models.test_execution  # noqa: F401
import app.models.test_run  # noqa: F401
import app.models.test_suite  # noqa: F401
import app.models.test_suite_case  # noqa: F401
import app.models.user  # noqa: F401
import app.models.user_story  # noqa: F401


# revision identifiers, used by Alembic.
revision: str = "6d4e3cac53e0"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the baseline schema using SQLAlchemy's metadata."""
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    """Drop every table managed by SQLAlchemy metadata. Destructive."""
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)
