"""Shared pytest fixtures for the test suite."""

import asyncio
import uuid
from collections.abc import AsyncGenerator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.security import create_access_token, get_password_hash
from app.db.base import Base
from app.models.project import Project
from app.models.role import Role
from app.models.user import User

settings = get_settings()

# Use a separate test database URL (append _test suffix or override via env)
TEST_DATABASE_URL = settings.DATABASE_URL.replace("/tcm_db", "/tcm_db_test") if "tcm_db" in settings.DATABASE_URL else settings.DATABASE_URL + "_test"

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionFactory = async_sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    """Create a session-scoped event loop for async tests."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_database():
    """Create all tables at the start of the test session and drop them at the end."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Provide a transactional database session that rolls back after each test."""
    async with TestSessionFactory() as session:
        async with session.begin():
            yield session
            await session.rollback()


@pytest_asyncio.fixture
async def test_role(db_session: AsyncSession) -> Role:
    """Create a test Admin role.

    Name is plain "Admin" so it slugifies to "admin" and matches the allowed
    role list on routes guarded by RoleChecker(["admin", ...]). Transactional
    rollback in db_session keeps this unique across tests.
    """
    role = Role(
        id=str(uuid.uuid4()),
        name="Admin",
        description="Test admin role",
        permissions={"users": ["create", "read", "update", "delete"]},
    )
    db_session.add(role)
    await db_session.flush()
    return role


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession, test_role: Role) -> User:
    """Create a test user with the test Admin role."""
    user = User(
        id=str(uuid.uuid4()),
        email=f"testuser_{uuid.uuid4().hex[:6]}@tcm.com",
        hashed_password=get_password_hash("Test@1234"),
        full_name="Test User",
        role_id=test_role.id,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest_asyncio.fixture
async def test_project(db_session: AsyncSession, test_user: User) -> Project:
    """Create a test project owned by test_user."""
    suffix = uuid.uuid4().hex[:6].upper()
    project = Project(
        id=str(uuid.uuid4()),
        name=f"TestProject_{suffix}",
        code=f"TP{suffix}",
        description="Test project",
        is_active=True,
        created_by=test_user.id,
    )
    db_session.add(project)
    await db_session.flush()
    return project


@pytest_asyncio.fixture
async def auth_headers(test_user: User) -> dict[str, str]:
    """Return authorization headers with a valid JWT for the test user.

    Includes `role_id` so get_current_user can look up the role name from the
    DB and expose the slugified role to RoleChecker.
    """
    token = create_access_token(
        subject=str(test_user.id),
        extra_claims={"role_id": str(test_user.role_id)},
    )
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture
async def async_client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Provide an async HTTP client bound to the FastAPI application.

    Overrides ``get_db`` to reuse the test's transactional session so that
    fixture-created rows are visible to request handlers.
    """
    # Import here to avoid circular imports and to allow app to be created after settings
    from app.main import app
    from app.api.dependencies import get_db

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)
