from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
class TestExecution(Base):
    """TestExecution model - individual test case execution result within a test run."""
    __tablename__ = "test_executions"
    # No soft delete for execution records
    is_deleted = None
    test_run_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("test_runs.id"),
        nullable=False,
        index=True,
    )
    test_case_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("test_cases.id"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="Not Run",
        server_default="Not Run",
        index=True,
        comment="Pass/Fail/Blocked/Skipped/Not Run",
    )
    executed_by: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    step_results: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Per-step execution results",
    )
    actual_result: Mapped[str | None] = mapped_column(Text, nullable=True)
    defect_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("defects.id"),
        nullable=True,
        index=True,
    )
    execution_time_seconds: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    executed_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Relationships
    test_run: Mapped["TestRun"] = relationship("TestRun", back_populates="executions")  # noqa: F821
    test_case: Mapped["TestCase"] = relationship("TestCase")  # noqa: F821
    executor: Mapped["User | None"] = relationship("User", foreign_keys=[executed_by])  # noqa: F821
    defect: Mapped["Defect | None"] = relationship("Defect", foreign_keys=[defect_id])  # noqa: F821
