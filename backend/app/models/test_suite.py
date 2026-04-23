from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
class TestSuite(Base):
    """TestSuite model - collection of test cases for organized execution."""
    __tablename__ = "test_suites"
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default="true",
        nullable=False,
    )
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )
    release_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("releases.id"),
        nullable=True,
        index=True,
    )
    created_by: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    # Relationships
    project: Mapped["Project"] = relationship("Project")  # noqa: F821
    release: Mapped["Release | None"] = relationship("Release")  # noqa: F821
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])  # noqa: F821
    test_suite_cases: Mapped[list["TestSuiteCase"]] = relationship(  # noqa: F821
        "TestSuiteCase",
        back_populates="test_suite",
        order_by="TestSuiteCase.order",
    )
