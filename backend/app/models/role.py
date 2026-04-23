from sqlalchemy import JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
class Role(Base):
    """Role model for RBAC.
    Predefined roles: Admin, QA Head, QA Engineer, Developer, Viewer, Auditor.
    """
    __tablename__ = "roles"
    name: Mapped[str] = mapped_column(
        String(50),
        unique=True,
        nullable=False,
        index=True,
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    permissions: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # Relationships
    users: Mapped[list["User"]] = relationship("User", back_populates="role")  # noqa: F821
