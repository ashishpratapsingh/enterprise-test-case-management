"""Authentication schemas."""

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginRequest(BaseModel):
    """User login credentials."""

    email: EmailStr = Field(description="User email address")
    password: str = Field(min_length=8, description="User password")


class TokenResponse(BaseModel):
    """JWT token pair returned after authentication."""

    model_config = ConfigDict(from_attributes=True)

    access_token: str = Field(description="JWT access token")
    refresh_token: str = Field(description="JWT refresh token")
    token_type: str = Field(default="bearer", description="Token type")


class RefreshTokenRequest(BaseModel):
    """Request to refresh an expired access token."""

    refresh_token: str = Field(description="JWT refresh token")
