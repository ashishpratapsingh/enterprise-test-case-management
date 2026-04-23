from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
class TestCase(Base):
    """TestCase model - core entity for test management."""
    __tablename__ = "test_cases"
    test_case_id: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        nullable=False,
        index=True,
        comment="Auto-generated ID in TC-00001 format",
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    preconditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    steps: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Array of {step_number, action, expected_result}",
    )
    expected_result: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="Medium",
        index=True,
        comment="Critical/High/Medium/Low",
    )
    severity: Mapped[str | None] = mapped_column(String(20), nullable=True)
    type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="Functional",
        index=True,
        comment="Functional/API/Regression/Performance/Security/UAT",
    )
    automation_status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="Manual",
        index=True,
        comment="Manual/Automated/To Be Automated",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="Draft",
        index=True,
        comment="Draft/Ready/Approved/Deprecated",
    )
    module_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("modules.id"),
        nullable=True,
        index=True,
    )
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id"),
        nullable=False,
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
    requirement_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("requirements.id"),
        nullable=True,
        index=True,
    )
    jira_ticket_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        index=True,
    )
    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default="1",
    )
    tags: Mapped[list | None] = mapped_column(
        JSON,
        nullable=True,
        comment="JSON array of tag strings",
    )
    assigned_to: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
    )
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
    project: Mapped["Project"] = relationship("Project")  # noqa: F821
    module: Mapped["Module | None"] = relationship("Module")  # noqa: F821
    epic: Mapped["Epic | None"] = relationship("Epic")  # noqa: F821
    user_story: Mapped["UserStory | None"] = relationship("UserStory")  # noqa: F821
    requirement: Mapped["Requirement | None"] = relationship("Requirement")  # noqa: F821
    assignee: Mapped["User | None"] = relationship("User", foreign_keys=[assigned_to])  # noqa: F821
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])  # noqa: F821
    versions: Mapped[list["TestCaseVersion"]] = relationship(  # noqa: F821
        "TestCaseVersion",
        back_populates="test_case",
        order_by="TestCaseVersion.version_number",
    )
    attachments: Mapped[list["Attachment"]] = relationship(  # noqa: F821
        "Attachment",
        primaryjoin="and_(TestCase.id == foreign(Attachment.entity_id), "
        "Attachment.entity_type == 'test_case')",
        viewonly=True,
    )
