from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
class Requirement(Base):
    """Requirement model - links to external requirements (e.g., JIRA)."""
    __tablename__ = "requirements"
    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )
    module_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("modules.id"),
        nullable=True,
        index=True,
    )
    external_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        index=True,
        comment="External reference ID (e.g., JIRA ticket)",
    )
    priority: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="Medium",
        index=True,
    )
    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="Active",
        index=True,
    )
    # Relationships
    project: Mapped["Project"] = relationship("Project")  # noqa: F821
    module: Mapped["Module | None"] = relationship("Module")  # noqa: F821
