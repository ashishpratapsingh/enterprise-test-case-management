from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
class Project(Base):
    """Project model - top-level organizational entity."""
    __tablename__ = "projects"
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    code: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        nullable=False,
        index=True,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default="true",
        nullable=False,
    )
    created_by: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )
    # Relationships
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by])  # noqa: F821
    modules: Mapped[list["Module"]] = relationship("Module", back_populates="project")  # noqa: F821
    releases: Mapped[list["Release"]] = relationship("Release", back_populates="project")  # noqa: F821
