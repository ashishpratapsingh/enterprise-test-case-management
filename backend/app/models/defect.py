from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
class Defect(Base):
    """Defect model - bugs/issues found during test execution."""
    __tablename__ = "defects"
    defect_id: Mapped[str] = mapped_column(
        String(30),
        unique=True,
        nullable=False,
        index=True,
        comment="Auto-generated ID in BUG-PROJ-0001 format",
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )
    severity: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="Medium",
        index=True,
        comment="Critical/High/Medium/Low",
    )
    priority: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="Medium",
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="Open",
        server_default="Open",
        index=True,
        comment="Open/In Progress/Fixed/Closed/Reopened",
    )
    reported_by: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    assigned_to: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
    epic_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("epics.id"),
        nullable=True,
        index=True,
    )
    user_story_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("user_stories.id"),
        nullable=True,
        index=True,
    )
    test_case_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("test_cases.id"),
        nullable=True,
        index=True,
    )
    test_execution_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("test_executions.id"),
        nullable=True,
        index=True,
        comment="Execution the bug was raised against (step-level context)",
    )
    step_number: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        index=True,
        comment="Step of the test case where the bug was observed",
    )
    jira_ticket_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
        index=True,
    )
    # Relationships
    project: Mapped["Project"] = relationship("Project")  # noqa: F821
    epic: Mapped["Epic | None"] = relationship("Epic")  # noqa: F821
    user_story: Mapped["UserStory | None"] = relationship("UserStory")  # noqa: F821
    test_case: Mapped["TestCase | None"] = relationship("TestCase")  # noqa: F821
    test_execution: Mapped["TestExecution | None"] = relationship(  # noqa: F821
        "TestExecution",
        foreign_keys=[test_execution_id],
    )
    reporter: Mapped["User"] = relationship("User", foreign_keys=[reported_by])  # noqa: F821
    assignee: Mapped["User | None"] = relationship("User", foreign_keys=[assigned_to])  # noqa: F821
