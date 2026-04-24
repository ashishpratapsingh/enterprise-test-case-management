from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base
class User(Base):
    """User model for authentication and authorization."""
    __tablename__ = "users"
    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("roles.id"),
        nullable=False,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        server_default="true",
        nullable=False,
    )
    # Password reset flow — token is stored as sha256 hex of the plaintext
    # issued to the user; expiry is a UTC datetime.
    password_reset_token: Mapped[str | None] = mapped_column(
        String(64), nullable=True, index=True
    )
    password_reset_expires: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    # Relationships
    role: Mapped["Role"] = relationship("Role", back_populates="users")  # noqa: F821
