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


class ForgotPasswordRequest(BaseModel):
    """Request to initiate a password reset flow."""

    email: EmailStr = Field(description="Email address of the account to reset")


class ResetPasswordRequest(BaseModel):
    """Complete a password reset using a token previously issued to the user."""

    token: str = Field(min_length=10, description="Password reset token")
    new_password: str = Field(min_length=8, description="New password (min 8 chars)")
