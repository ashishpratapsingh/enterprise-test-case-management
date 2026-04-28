"""Defect management routes."""

import os
import uuid

from fastapi import APIRouter, Body, Depends, File, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_current_user, get_db, success_response
from app.services.attachment_service import AttachmentService
from app.services.defect_service import DefectService
from app.utils.helpers import build_filters


class _BulkIds(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500, description="Defect IDs")


class _BulkTransition(_BulkIds):
    status: str = Field(min_length=1, max_length=30)


class _BulkAssign(_BulkIds):
    assigned_to: str | None = Field(default=None, description="Target user ID, or null to unassign")


class _BulkUpdate(_BulkIds):
    """Plain-field bulk edit — severity and/or priority. Each is optional;
    omit the field entirely (or send null) to leave it unchanged across
    the selected defects."""
    severity: str | None = Field(default=None, max_length=30)
    priority: str | None = Field(default=None, max_length=30)

UPLOAD_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__)))),
    "uploads",
)
os.makedirs(UPLOAD_DIR, exist_ok=True)

router = APIRouter(prefix="/defects", tags=["Defects"])


@router.get(
    "",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List defects",
)
async def list_defects(
    project_id: str | None = Query(default=None, description="Filter by project ID"),
    severity: str | None = Query(default=None, description="Filter by severity"),
    priority: str | None = Query(default=None, description="Filter by priority"),
    defect_status: str | None = Query(default=None, alias="status", description="Filter by status"),
    assigned_to: str | None = Query(default=None, description="Filter by assignee"),
    search: str | None = Query(default=None, description="Search by title or description"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List defects with filtering and pagination."""
    service = DefectService(db)
    filters = build_filters(
        project_id=project_id,
        severity=severity,
        priority=priority,
        status=defect_status,
        assigned_to=assigned_to,
        search=search,
    )
    result = await service.list_defects(
        page=page,
        page_size=page_size,
        filters=filters if filters else None,
    )
    return success_response(data=result, message="Defects retrieved successfully")


@router.post(
    "",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Create defect",
)
async def create_defect(
    defect_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Create a new defect, optionally linked to a test execution."""
    service = DefectService(db)
    defect_data["reported_by"] = current_user["id"]
    defect = await service.create_defect(data=defect_data)
    return success_response(data=defect, message="Defect created successfully")


@router.get(
    "/{defect_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Get defect by ID",
)
async def get_defect(
    defect_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Get a specific defect by UUID."""
    service = DefectService(db)
    defect = await service.get_defect(defect_id=defect_id)
    return success_response(data=defect, message="Defect retrieved successfully")


@router.put(
    "/{defect_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Update defect",
)
async def update_defect(
    defect_id: str,
    defect_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Update an existing defect."""
    service = DefectService(db)
    defect = await service.update_defect(
        defect_id=defect_id, data=defect_data
    )
    return success_response(data=defect, message="Defect updated successfully")


@router.delete(
    "/{defect_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Soft delete defect",
)
async def delete_defect(
    defect_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Soft delete a defect."""
    service = DefectService(db)
    await service.delete_defect(defect_id=defect_id)
    return success_response(message="Defect deleted successfully")


# ── Bulk operations ────────────────────────────────────────────────────────
#
# Each bulk endpoint accepts up to 500 IDs and returns a structured
# {succeeded, failed} report. Per-id failures are non-fatal — the route
# always returns 200 with the partial result so the UI can show progress.

@router.post(
    "/bulk-delete",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Soft-delete multiple defects",
)
async def bulk_delete_defects(
    payload: _BulkIds = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    service = DefectService(db)
    result = await service.bulk_delete(payload.ids)
    return success_response(
        data=result,
        message=f"{len(result['succeeded'])} defect(s) deleted",
    )


@router.post(
    "/bulk-transition",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Transition multiple defects to a new status",
)
async def bulk_transition_defects(
    payload: _BulkTransition = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    service = DefectService(db)
    result = await service.bulk_transition_status(payload.ids, payload.status)
    return success_response(
        data=result,
        message=f"{len(result['succeeded'])} defect(s) transitioned to '{payload.status}'",
    )


@router.post(
    "/bulk-assign",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Assign multiple defects to a user",
)
async def bulk_assign_defects(
    payload: _BulkAssign = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    service = DefectService(db)
    result = await service.bulk_assign(payload.ids, payload.assigned_to)
    return success_response(
        data=result,
        message=f"{len(result['succeeded'])} defect(s) updated",
    )


@router.post(
    "/bulk-update",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Bulk-update simple fields (severity, priority) on multiple defects",
)
async def bulk_update_defects(
    payload: _BulkUpdate = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    if payload.severity is None and payload.priority is None:
        from app.core.exceptions import ValidationError
        raise ValidationError("At least one of severity / priority must be provided")
    service = DefectService(db)
    result = await service.bulk_update(
        payload.ids,
        severity=payload.severity,
        priority=payload.priority,
    )
    return success_response(
        data=result,
        message=f"{len(result['succeeded'])} defect(s) updated",
    )


@router.post(
    "/{defect_id}/transition",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Transition defect status",
)
async def transition_defect_status(
    defect_id: str,
    transition_data: dict,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Transition a defect to a new status (e.g., open -> in_progress -> fixed -> verified -> closed).

    Expected transition_data: {"status": "<new_status>", "comment": "<optional>"}
    """
    service = DefectService(db)
    defect = await service.transition_status(
        defect_id=defect_id,
        new_status=transition_data["status"],
    )
    return success_response(data=defect, message="Defect status updated successfully")


@router.post(
    "/{defect_id}/upload",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Upload attachment for a defect",
)
async def upload_defect_attachment(
    defect_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Upload a screenshot, video, or document for a defect."""
    service = DefectService(db)
    await service.get_defect(defect_id=defect_id)

    ext = os.path.splitext(file.filename or "file")[1]
    unique_name = f"defect_{defect_id}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_name)

    contents = await file.read()
    with open(file_path, "wb") as f:
        f.write(contents)

    # Record in attachments table
    att_service = AttachmentService(db)
    attachment = await att_service.upload(
        entity_type="defect",
        entity_id=defect_id,
        filename=file.filename or unique_name,
        content_type=file.content_type or "application/octet-stream",
        file_path=f"/uploads/{unique_name}",
        file_size=len(contents),
        uploaded_by=current_user["id"],
    )

    return success_response(
        data={
            "id": attachment.id,
            "url": f"/uploads/{unique_name}",
            "filename": file.filename,
            "size": len(contents),
        },
        message="File uploaded successfully",
    )


@router.get(
    "/{defect_id}/attachments",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List attachments for a defect",
)
async def list_defect_attachments(
    defect_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List all attachments for a defect."""
    att_service = AttachmentService(db)
    attachments = await att_service.list_by_entity("defect", defect_id)
    items = [
        {
            "id": att.id,
            "url": att.file_path,
            "filename": att.file_name,
            "size": att.file_size,
            "content_type": att.content_type,
            "created_at": att.created_at.isoformat() if att.created_at else None,
        }
        for att in attachments
    ]
    return success_response(data=items, message="Attachments retrieved successfully")


@router.delete(
    "/{defect_id}/attachments/{attachment_id}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Delete a defect attachment",
)
async def delete_defect_attachment(
    defect_id: str,
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Delete an attachment from a defect."""
    att_service = AttachmentService(db)
    attachment = await att_service.download(attachment_id)
    # Remove the physical file
    physical_path = os.path.join(UPLOAD_DIR, os.path.basename(attachment.file_path))
    if os.path.exists(physical_path):
        os.remove(physical_path)
    # Remove DB record
    await db.delete(attachment)
    await db.flush()
    return success_response(message="Attachment deleted successfully")
