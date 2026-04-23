from sqlalchemy import ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
class TestCaseVersion(Base):
    """TestCaseVersion model - versioned snapshot of a test case."""
    __tablename__ = "test_case_versions"
    # Remove is_deleted from Base since versions are immutable records
    is_deleted = None
    test_case_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("test_cases.id"),
        nullable=False,
        index=True,
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot: Mapped[dict] = mapped_column(
        JSON,
        nullable=False,
        comment="Full test case data snapshot at this version",
    )
    changed_by: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    change_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Relationships
    test_case: Mapped["TestCase"] = relationship("TestCase", back_populates="versions")  # noqa: F821
    changer: Mapped["User"] = relationship("User", foreign_keys=[changed_by])  # noqa: F821
