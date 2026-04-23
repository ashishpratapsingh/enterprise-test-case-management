import datetime

from sqlalchemy import Date, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Epic(Base):
    """Epic model - high-level requirement grouping."""

    __tablename__ = "epics"

    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    labels: Mapped[str | None] = mapped_column(
        Text, nullable=True, comment="Comma-separated labels"
    )
    start_date: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    due_date: Mapped[datetime.date | None] = mapped_column(Date, nullable=True)
    priority: Mapped[str] = mapped_column(
        String(20), nullable=False, default="medium", server_default="medium", index=True
    )
    assigned_to: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True, index=True
    )
    created_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )

    # Relationships
    project: Mapped["Project | None"] = relationship("Project")  # noqa: F821
    assignee: Mapped["User | None"] = relationship(  # noqa: F821
        "User", foreign_keys=[assigned_to]
    )
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])  # noqa: F821
