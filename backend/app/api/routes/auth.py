"""Authentication routes."""

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    RoleChecker,
    get_db,
    success_response,
)
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RefreshTokenRequest,
    ResetPasswordRequest,
)
from app.schemas.user import UserCreate
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post(
    "/login",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="User login",
)
async def login(
    credentials: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Authenticate user with email and password, return access and refresh tokens."""
    service = AuthService(db)
    tokens = await service.login(
        email=credentials.email, password=credentials.password
    )
    return success_response(data=tokens, message="Login successful")


@router.post(
    "/refresh",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Refresh access token",
)
async def refresh_token(
    body: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Exchange a valid refresh token for a new access/refresh token pair."""
    service = AuthService(db)
    tokens = await service.refresh_token(token=body.refresh_token)
    return success_response(data=tokens, message="Token refreshed")


@router.post(
    "/register",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user (admin only)",
)
async def register(
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(allowed_roles=["admin"])),
) -> dict:
    """Register a new user account. Only administrators can create new users."""
    service = AuthService(db)
    user = await service.register(
        email=user_data.email,
        password=user_data.password,
        full_name=user_data.full_name,
        role_id=str(user_data.role_id),
    )
    return success_response(data={"id": user.id, "email": user.email}, message="User registered successfully")


@router.post(
    "/forgot-password",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Begin a password reset flow",
)
async def forgot_password(
    body: ForgotPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Request a password reset.

    Returns a generic success message regardless of whether the email exists
    to prevent user enumeration. When DEBUG is enabled, the response includes
    the plaintext ``reset_token`` so local/dev flows can complete without
    email infrastructure.
    """
    service = AuthService(db)
    result = await service.request_password_reset(email=body.email)
    return success_response(data=result, message=result.get("message", "OK"))


@router.post(
    "/reset-password",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Complete a password reset",
)
async def reset_password(
    body: ResetPasswordRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Complete a password reset using the token issued via /forgot-password."""
    service = AuthService(db)
    result = await service.reset_password(
        token=body.token, new_password=body.new_password
    )
    return success_response(data=result, message=result.get("message", "OK"))
