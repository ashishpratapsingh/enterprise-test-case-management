from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
class Module(Base):
    """Module model - subdivision within a project."""
    __tablename__ = "modules"
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    project_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("projects.id"),
        nullable=False,
        index=True,
    )
    # Relationships
    project: Mapped["Project"] = relationship("Project", back_populates="modules")  # noqa: F821
