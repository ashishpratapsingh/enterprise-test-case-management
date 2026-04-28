"""Seed script to populate the database with default roles, admin user, and sample data."""

import asyncio
import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings
from app.core.security import get_password_hash
from app.db.base import Base
from app.models.module import Module
from app.models.project import Project
from app.models.release import Release
from app.models.role import Role
from app.models.user import User

settings = get_settings()

# Default roles with permissions
DEFAULT_ROLES = [
    {
        "name": "Admin",
        "description": "Full system access including user and role management.",
        "permissions": {
            "users": ["create", "read", "update", "delete"],
            "roles": ["create", "read", "update", "delete"],
            "projects": ["create", "read", "update", "delete"],
            "modules": ["create", "read", "update", "delete"],
            "test_cases": ["create", "read", "update", "delete", "execute"],
            "releases": ["create", "read", "update", "delete"],
            "reports": ["create", "read", "export"],
            "integrations": ["manage"],
        },
    },
    {
        "name": "QA Head",
        "description": "Manages QA projects, assigns test cases, reviews results.",
        "permissions": {
            "projects": ["create", "read", "update"],
            "modules": ["create", "read", "update"],
            "test_cases": ["create", "read", "update", "delete", "execute", "assign"],
            "releases": ["create", "read", "update"],
            "reports": ["create", "read", "export"],
        },
    },
    {
        "name": "QA Engineer",
        "description": "Creates and executes test cases, logs defects.",
        "permissions": {
            "projects": ["read"],
            "modules": ["read"],
            "test_cases": ["create", "read", "update", "execute"],
            "releases": ["read"],
            "reports": ["read"],
        },
    },
    {
        "name": "Developer",
        "description": "Views test cases and execution results for owned modules.",
        "permissions": {
            "projects": ["read"],
            "modules": ["read"],
            "test_cases": ["read"],
            "releases": ["read"],
            "reports": ["read"],
        },
    },
    {
        "name": "Viewer",
        "description": "Read-only access to projects, test cases, and reports.",
        "permissions": {
            "projects": ["read"],
            "modules": ["read"],
            "test_cases": ["read"],
            "releases": ["read"],
            "reports": ["read"],
        },
    },
    {
        "name": "Auditor",
        "description": "Read-only access with audit trail visibility.",
        "permissions": {
            "projects": ["read"],
            "modules": ["read"],
            "test_cases": ["read"],
            "releases": ["read"],
            "reports": ["read", "export"],
            "audit_logs": ["read"],
        },
    },
]


async def seed_roles(session: AsyncSession) -> dict[str, uuid.UUID]:
    """Create default roles if they do not already exist.

    Returns:
        Mapping of role name to role id.
    """
    role_map: dict[str, uuid.UUID] = {}
    for role_data in DEFAULT_ROLES:
        result = await session.execute(
            select(Role).where(Role.name == role_data["name"])
        )
        role = result.scalar_one_or_none()
        if role is None:
            role = Role(**role_data)
            session.add(role)
            await session.flush()
            print(f"  Created role: {role.name}")
        else:
            print(f"  Role already exists: {role.name}")
        role_map[role.name] = role.id
    return role_map


async def seed_admin_user(session: AsyncSession, admin_role_id: uuid.UUID) -> uuid.UUID:
    """Create the default admin user if not present.

    Returns:
        The admin user's id.
    """
    result = await session.execute(
        select(User).where(User.email == "ashish.pratap@sabpaisa.in")
    )
    admin = result.scalar_one_or_none()
    if admin is None:
        admin = User(
            email="ashish.pratap@sabpaisa.in",
            hashed_password=get_password_hash("Admin@123"),
            full_name="Ashish Pratap Singh",
            role_id=admin_role_id,
            is_active=True,
        )
        session.add(admin)
        await session.flush()
        print("  Created admin user: ashish.pratap@sabpaisa.in")
    else:
        print("  Admin user already exists: ashish.pratap@sabpaisa.in")
    return admin.id


async def seed_sample_project(session: AsyncSession, admin_id: uuid.UUID) -> None:
    """Create a sample project, module, and release."""
    result = await session.execute(
        select(Project).where(Project.code == "DEMO")
    )
    project = result.scalar_one_or_none()
    if project is None:
        project = Project(
            name="Demo Project",
            code="DEMO",
            description="A sample project to demonstrate TCM features.",
            created_by=admin_id,
        )
        session.add(project)
        await session.flush()
        print("  Created sample project: Demo Project (DEMO)")

        module = Module(
            name="Login Module",
            description="Authentication and login functionality.",
            project_id=project.id,
        )
        session.add(module)
        print("  Created sample module: Login Module")

        release = Release(
            name="Release 1.0",
            version="1.0.0",
            description="Initial release with core features.",
            project_id=project.id,
            status="Planned",
            start_date=date.today(),
        )
        session.add(release)
        print("  Created sample release: Release 1.0")
    else:
        print("  Sample project already exists: Demo Project (DEMO)")


async def main() -> None:
    """Run all seed operations."""
    print("Starting database seed...")

    engine = create_async_engine(str(settings.DATABASE_URL), echo=False)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Create tables if they don't exist (useful for first run without migrations)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        async with session.begin():
            print("\n[1/3] Seeding roles...")
            role_map = await seed_roles(session)

            print("\n[2/3] Seeding admin user...")
            admin_id = await seed_admin_user(session, role_map["Admin"])

            print("\n[3/3] Seeding sample project data...")
            await seed_sample_project(session, admin_id)

    await engine.dispose()
    print("\nSeed completed successfully.")


if __name__ == "__main__":
    asyncio.run(main())
