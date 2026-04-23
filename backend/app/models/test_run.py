from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
class TestRun(Base):
    """TestRun model - execution instance of a test suite."""
    __tablename__ = "test_runs"
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    test_suite_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("test_suites.id"),
        nullable=False,
        index=True,
    )
    release_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("releases.id"),
        nullable=True,
        index=True,
    )
    assigned_to: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="Not Started",
        server_default="Not Started",
        index=True,
        comment="Not Started/In Progress/Completed/Blocked/Cancelled",
    )
    environment: Mapped[str | None] = mapped_column(String(100), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    abort_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        index=True,
    )
    # Relationships
    test_suite: Mapped["TestSuite"] = relationship("TestSuite")  # noqa: F821
    release: Mapped["Release | None"] = relationship("Release")  # noqa: F821
    assignee: Mapped["User | None"] = relationship(  # noqa: F821
        "User", foreign_keys=[assigned_to]
    )
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])  # noqa: F821
    executions: Mapped[list["TestExecution"]] = relationship(  # noqa: F821
        "TestExecution", back_populates="test_run"
    )
