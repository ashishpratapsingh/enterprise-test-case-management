from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
class Attachment(Base):
    """Attachment model - file attachments for test cases, defects, and executions."""
    __tablename__ = "attachments"
    # Attachments are immutable records, no soft delete or updated_at needed
    is_deleted = None
    updated_at = None
    file_name: Mapped[str] = mapped_column(String(500), nullable=False)
    file_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False)
    content_type: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        index=True,
        comment="test_case/defect/execution",
    )
    entity_id: Mapped[str] = mapped_column(
        String(36),
        nullable=False,
        index=True,
    )
    uploaded_by: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        nullable=False,
    )
    # Relationships
    uploader: Mapped["User"] = relationship("User", foreign_keys=[uploaded_by])  # noqa: F821
