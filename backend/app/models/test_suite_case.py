from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
class TestSuiteCase(Base):
    """TestSuiteCase model - association between test suites and test cases."""
    __tablename__ = "test_suite_cases"
    # Remove soft delete columns not needed for association table
    is_deleted = None
    updated_at = None
    test_suite_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("test_suites.id"),
        nullable=False,
        index=True,
    )
    test_case_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("test_cases.id"),
        nullable=False,
        index=True,
    )
    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
    # Relationships
    test_suite: Mapped["TestSuite"] = relationship(  # noqa: F821
        "TestSuite", back_populates="test_suite_cases"
    )
    test_case: Mapped["TestCase"] = relationship("TestCase")  # noqa: F821
