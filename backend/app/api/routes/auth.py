"""Authentication routes."""

from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import (
    RoleChecker,
    get_db,
    success_response,
)
from app.core.config import get_settings
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    RefreshTokenRequest,
    ResetPasswordRequest,
)
from app.schemas.user import UserCreate
from app.services.auth_service import AuthService
from app.services.sso_service import SSOService

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


# ── SSO (OpenID Connect) ───────────────────────────────────────────────────


@router.get(
    "/sso/config",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Public-ish SSO config (whether the button should appear)",
)
async def get_sso_config(
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Tell the frontend whether SSO is wired and what to label the
    button. Never returns the client secret. No auth required —
    LoginPage hits this before the user has a session."""
    service = SSOService(db)
    return success_response(
        data={
            "enabled": service.is_configured(),
            "provider_name": service.settings.OIDC_PROVIDER_NAME,
            "login_url": "/api/v1/auth/sso/login",
        },
        message="SSO config",
    )


@router.get(
    "/sso/login",
    response_model=None,
    status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    summary="Begin SSO login — redirects to the IdP",
)
async def sso_login(
    return_to: str | None = Query(
        default=None,
        description="Optional path to land on after successful login (e.g. /dashboard)",
    ),
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Generates a signed state, redirects to the IdP's authorize URL.
    The browser follows the redirect; the IdP eventually calls our
    /sso/callback."""
    service = SSOService(db)
    url = await service.begin_login(return_to=return_to)
    return RedirectResponse(url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


@router.get(
    "/sso/callback",
    response_model=None,
    status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    summary="OIDC callback — exchanges code, issues JWTs, redirects to frontend",
)
async def sso_callback(
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None, description="IdP-supplied error code"),
    error_description: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    """Receive the IdP's redirect, exchange code for tokens, look up
    or auto-provision the user, and bounce back to the frontend with
    our own JWTs in the URL fragment.

    Putting tokens in the **fragment** (``#``) keeps them out of
    server logs and Referer headers — the frontend reads them client-
    side and immediately stores them.
    """
    settings = get_settings()
    base = settings.APP_BASE_URL.rstrip("/")

    # IdP-supplied error: bounce to the SSO landing with an error
    # query string so the UI can show a friendly message.
    if error:
        msg = error_description or error
        return RedirectResponse(
            f"{base}/sso/callback?error={quote(msg, safe='')}",
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        )

    if not code or not state:
        return RedirectResponse(
            f"{base}/sso/callback?error={quote('Missing code or state', safe='')}",
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        )

    service = SSOService(db)
    try:
        tokens = await service.handle_callback(code=code, state=state)
    except Exception as exc:  # noqa: BLE001 — surfaced via redirect
        # All exceptions become user-facing error messages on the
        # SSO landing page. We don't want to leak stack traces.
        return RedirectResponse(
            f"{base}/sso/callback?error={quote(str(exc), safe='')}",
            status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        )

    return_to = tokens.get("return_to") or "/dashboard"
    fragment = (
        f"access_token={tokens['access_token']}"
        f"&refresh_token={tokens['refresh_token']}"
        f"&user_id={tokens['user_id']}"
        f"&return_to={quote(return_to, safe='')}"
    )
    return RedirectResponse(
        f"{base}/sso/callback#{fragment}",
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    )
