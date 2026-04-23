from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class UserStory(Base):
    """User Story model - linked to epics."""

    __tablename__ = "user_stories"

    epic_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("epics.id"), nullable=True, index=True
    )
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    acceptance_criteria: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[str] = mapped_column(
        String(20), nullable=False, default="medium", server_default="medium", index=True
    )
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="open", server_default="open", index=True
    )
    story_points: Mapped[int | None] = mapped_column(nullable=True)
    assigned_to: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True, index=True
    )
    created_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )

    # Relationships
    epic: Mapped["Epic | None"] = relationship("Epic")  # noqa: F821
    project: Mapped["Project | None"] = relationship("Project")  # noqa: F821
    assignee: Mapped["User | None"] = relationship(  # noqa: F821
        "User", foreign_keys=[assigned_to]
    )
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])  # noqa: F821
