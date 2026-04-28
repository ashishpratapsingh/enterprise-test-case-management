"""Integration-layer routes (JIRA, CI ingest, Bitbucket, AI).

JIRA + CI ingest are wired today; the others raise 422 / 501 until
their respective milestone tasks land.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Body, Depends, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import RoleChecker, get_db, success_response
from app.core.exceptions import NotFoundError
from app.repositories.defect_repository import DefectRepository
from app.repositories.test_case_repository import TestCaseRepository
from app.services.integration_service import IntegrationService

router = APIRouter(prefix="/integrations", tags=["Integrations"])

_EDITOR_ROLES = ["admin", "qa_head", "qa_engineer"]


# ── Request schemas ────────────────────────────────────────────────────────


class _CreateJiraIssue(BaseModel):
    project_key: str = Field(min_length=1, max_length=50)
    summary: str = Field(min_length=1, max_length=255)
    description: str = Field(default="", max_length=32000)
    issue_type: str = Field(default="Bug", max_length=50)
    # Optional auto-link: when provided, write the new JIRA key back to
    # the matching defect / test case row's ``jira_ticket_id`` column.
    defect_id: str | None = None
    test_case_id: str | None = None


class _CIResultEntry(BaseModel):
    """One per test case in the CI build."""
    test_case_id: str = Field(min_length=1, max_length=100, description="Human-readable ID, e.g. TC-PROJ-0001")
    status: str = Field(min_length=1, max_length=30, description="pass / fail / skipped / blocked (case-insensitive)")
    duration_seconds: float | None = Field(default=None, ge=0, description="Wall-clock test duration")
    error_message: str | None = Field(default=None, max_length=8000, description="Failure message / stack trace")


class _CIIngestResults(BaseModel):
    """Payload posted by a CI pipeline after a build's tests finish.

    The CI script needs to know two stable IDs up front:
    ``project_id`` (UUID) and ``test_suite_id`` (UUID). Stash both in
    CI variables once, then post results from every build."""
    project_id: str = Field(min_length=1, description="Target project UUID")
    test_suite_id: str = Field(min_length=1, description="Target test suite UUID (must belong to project_id)")
    run_name: str = Field(min_length=1, max_length=255, description="Display name, e.g. 'Build #1234'")
    environment: str | None = Field(default=None, max_length=100)
    started_at: datetime | None = None
    completed_at: datetime | None = None
    results: list[_CIResultEntry] = Field(min_length=1, max_length=10000)


# ── JIRA routes ────────────────────────────────────────────────────────────


@router.get(
    "/jira/config",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Public-ish JIRA config (browse URL + default project key)",
)
async def get_jira_config(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(allowed_roles=_EDITOR_ROLES)),
) -> dict:
    """Return just enough JIRA config for the frontend to build issue URLs.

    No HTTP calls are made — this only echoes back the public-facing
    base URL + default project key from server settings. The API token
    is NEVER included in the response.
    """
    service = IntegrationService(db)
    s = service.settings
    configured = bool(s.JIRA_BASE_URL and s.JIRA_API_TOKEN)
    return success_response(
        data={
            "configured": configured,
            "base_url": s.JIRA_BASE_URL or "",
            "default_project_key": s.JIRA_DEFAULT_PROJECT_KEY or "",
        },
        message="JIRA config",
    )


@router.get(
    "/jira/issues/{issue_key}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Fetch a JIRA issue by key",
)
async def get_jira_issue(
    issue_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(allowed_roles=_EDITOR_ROLES)),
) -> dict:
    service = IntegrationService(db)
    issue = await service.jira_get_issue(issue_key=issue_key)
    return success_response(data=issue, message="JIRA issue retrieved")


@router.post(
    "/jira/issues",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Create a JIRA issue (optionally auto-link to a defect / test case)",
)
async def create_jira_issue(
    payload: _CreateJiraIssue = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(allowed_roles=_EDITOR_ROLES)),
) -> dict:
    service = IntegrationService(db)
    issue = await service.jira_create_issue(
        project_key=payload.project_key,
        summary=payload.summary,
        description=payload.description,
        issue_type=payload.issue_type,
    )

    linked_to: str | None = None
    if payload.defect_id:
        repo = DefectRepository(db)
        updated = await repo.update(payload.defect_id, {"jira_ticket_id": issue["key"]})
        if updated is None:
            raise NotFoundError(f"Defect '{payload.defect_id}' not found")
        linked_to = f"defect:{payload.defect_id}"
    elif payload.test_case_id:
        repo = TestCaseRepository(db)
        updated = await repo.update(payload.test_case_id, {"jira_ticket_id": issue["key"]})
        if updated is None:
            raise NotFoundError(f"Test case '{payload.test_case_id}' not found")
        linked_to = f"test_case:{payload.test_case_id}"

    return success_response(
        data={**issue, "linked_to": linked_to},
        message="JIRA issue created" + (f" and linked to {linked_to}" if linked_to else ""),
    )


# ── CI Results Ingest ──────────────────────────────────────────────────────


@router.post(
    "/ci/results",
    response_model=None,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest results from a CI pipeline (creates a TestRun + Executions)",
)
async def ingest_ci_results(
    payload: _CIIngestResults = Body(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(allowed_roles=_EDITOR_ROLES)),
) -> dict:
    """Receive a CI build's test results and record them as a completed
    TestRun. Each entry in ``results`` is matched to an existing test
    case by its human-readable ``test_case_id``; unknown ids and
    unrecognised statuses are reported in ``failed[]`` rather than
    aborting the whole batch.

    Authentication: standard JWT. Use a service-account user (an admin
    with role allowed in the editor list) and stash its token in your
    CI's secret manager. There is no separate API-key system today.
    """
    service = IntegrationService(db)
    summary = await service.ingest_ci_results(
        project_id=payload.project_id,
        test_suite_id=payload.test_suite_id,
        run_name=payload.run_name,
        environment=payload.environment,
        started_at=payload.started_at,
        completed_at=payload.completed_at,
        results=[r.model_dump() for r in payload.results],
        executed_by=current_user["id"],
    )
    return success_response(
        data=summary,
        message=(
            f"Ingested {len(summary['succeeded'])} result(s) into run "
            f"'{summary['test_run_name']}'"
            + (f"; {len(summary['failed'])} skipped" if summary["failed"] else "")
        ),
    )


# ── GitHub routes ──────────────────────────────────────────────────────────


@router.get(
    "/github/config",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Public-ish GitHub config (configured flag + default repo)",
)
async def get_github_config(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(allowed_roles=_EDITOR_ROLES)),
) -> dict:
    """Tells the frontend whether GitHub is wired and what the default
    repo is. Never returns the API token."""
    service = IntegrationService(db)
    s = service.settings
    configured = bool(s.GITHUB_TOKEN)
    return success_response(
        data={
            "configured": configured,
            "default_repo": s.GITHUB_DEFAULT_REPO or "",
            # Surface the API base so the frontend can build browse
            # links without re-deriving them. Empty when unconfigured
            # so a leaked default doesn't suggest GH.com is in use.
            "browse_base_url": (
                service.github_browse_url(s.GITHUB_DEFAULT_REPO or "owner/repo").rsplit("/", 2)[0]
                if configured else ""
            ),
        },
        message="GitHub config",
    )


@router.get(
    "/github/commits",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List commits on a branch of a GitHub repo",
)
async def list_github_commits(
    repo: str = Query(..., min_length=3, description="owner/repo slug"),
    branch: str | None = Query(default=None, description="Branch name; default branch when blank"),
    per_page: int = Query(default=25, ge=1, le=100),
    page: int = Query(default=1, ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(allowed_roles=_EDITOR_ROLES)),
) -> dict:
    service = IntegrationService(db)
    commits = await service.github_list_commits(
        repo, branch=branch, per_page=per_page, page=page
    )
    return success_response(data=commits, message=f"{len(commits)} commit(s)")


@router.get(
    "/github/commits/{sha}",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="Fetch a single commit by SHA",
)
async def get_github_commit(
    sha: str,
    repo: str = Query(..., min_length=3, description="owner/repo slug"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(allowed_roles=_EDITOR_ROLES)),
) -> dict:
    service = IntegrationService(db)
    commit = await service.github_get_commit(repo, sha)
    return success_response(data=commit, message="Commit fetched")


@router.get(
    "/github/pulls",
    response_model=None,
    status_code=status.HTTP_200_OK,
    summary="List pull requests on a GitHub repo",
)
async def list_github_pulls(
    repo: str = Query(..., min_length=3, description="owner/repo slug"),
    state: str = Query(default="open", pattern="^(open|closed|all)$"),
    per_page: int = Query(default=25, ge=1, le=100),
    page: int = Query(default=1, ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(allowed_roles=_EDITOR_ROLES)),
) -> dict:
    service = IntegrationService(db)
    pulls = await service.github_list_pulls(
        repo, state=state, per_page=per_page, page=page
    )
    return success_response(data=pulls, message=f"{len(pulls)} pull request(s)")
