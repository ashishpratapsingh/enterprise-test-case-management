"""Audit log routes (admin + auditor read access)."""

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import RoleChecker, get_db, success_response
from app.services.audit_service import AuditService

router = APIRouter(prefix="/audit", tags=["Audit"])

_ReadAccess = RoleChecker(allowed_roles=["admin", "auditor"])


@router.get("", response_model=None, status_code=status.HTTP_200_OK, summary="List audit logs")
async def list_audit_logs(
    entity_type: str | None = Query(default=None, description="Filter by entity type (e.g. test_case)"),
    entity_id: str | None = Query(default=None, description="Filter by entity id"),
    action: str | None = Query(default=None, description="CREATE / UPDATE / DELETE / LOGIN / LOGOUT / …"),
    user_id: str | None = Query(default=None, description="Filter by actor user id"),
    start_date: str | None = Query(default=None, description="ISO-8601 or YYYY-MM-DD"),
    end_date: str | None = Query(default=None, description="ISO-8601 or YYYY-MM-DD"),
    search: str | None = Query(default=None, description="Search on entity_type/entity_id/action"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(_ReadAccess),
) -> dict:
    """List audit log entries with filtering. Restricted to admin and auditor."""
    service = AuditService(db)
    items, total = await service.list_audit_logs(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        user_id=user_id,
        start_date=start_date,
        end_date=end_date,
        search=search,
        page=page,
        page_size=page_size,
    )
    return success_response(data=[items, total], message="Audit logs retrieved successfully")


@router.get("/stats", response_model=None, status_code=status.HTTP_200_OK, summary="Audit activity stats")
async def audit_stats(
    days: int = Query(default=7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(_ReadAccess),
) -> dict:
    service = AuditService(db)
    stats = await service.stats(days=days)
    return success_response(data=stats, message="Audit stats retrieved successfully")


@router.get(
    "/entity/{entity_type}/{entity_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get audit trail for a specific entity",
)
async def get_entity_audit_trail(
    entity_type: str,
    entity_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(_ReadAccess),
) -> dict:
    service = AuditService(db)
    items, total = await service.get_entity_audit_trail(
        entity_type=entity_type,
        entity_id=entity_id,
        page=page,
        page_size=page_size,
    )
    return success_response(data=[items, total], message="Audit trail retrieved successfully")
