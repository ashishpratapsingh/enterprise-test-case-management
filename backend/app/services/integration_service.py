"""Integration service for outbound calls to JIRA, Bitbucket, and AI providers.

Each integration checks for required configuration before executing.
If the necessary environment variables aren't set, the methods raise
``ValidationError`` (so the API returns 422 with a clear message about
what's missing). Upstream HTTP failures raise ``IntegrationError``
(HTTP 502).

The HTTP layer is httpx.AsyncClient. The client is created per call —
JIRA endpoints are invoked rarely from this app's perspective so a
shared connection pool isn't worth the lifecycle complexity.
"""

from __future__ import annotations

import base64
import logging
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import IntegrationError, NotFoundError, ValidationError

logger = logging.getLogger(__name__)

_JIRA_TIMEOUT_SECONDS = 10.0
_GITHUB_TIMEOUT_SECONDS = 10.0
# Default to public GitHub. Override via GITHUB_BASE_URL for Enterprise
# (``https://github.your-org.com/api/v3``).
_GITHUB_DEFAULT_API = "https://api.github.com"


class IntegrationService:
    """Provides integration methods for external services."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.settings = get_settings()

    # ── JIRA Integration ────────────────────────────────────────────────

    def _ensure_jira_configured(self) -> None:
        if not self.settings.JIRA_BASE_URL or not self.settings.JIRA_API_TOKEN:
            raise ValidationError(
                "JIRA integration is not configured. Set JIRA_BASE_URL and "
                "JIRA_API_TOKEN env vars (and JIRA_USER_EMAIL for JIRA Cloud)."
            )

    def _jira_headers(self) -> dict[str, str]:
        """Return Authorization + content-type headers for the JIRA API.

        JIRA Cloud expects Basic auth with ``email:api_token`` base64-encoded.
        Self-hosted JIRA Server expects ``Bearer <token>``. We pick based on
        whether ``JIRA_USER_EMAIL`` is set.
        """
        s = self.settings
        if s.JIRA_USER_EMAIL:
            cred = f"{s.JIRA_USER_EMAIL}:{s.JIRA_API_TOKEN}"
            token = base64.b64encode(cred.encode("utf-8")).decode("ascii")
            auth = f"Basic {token}"
        else:
            auth = f"Bearer {s.JIRA_API_TOKEN}"
        return {
            "Authorization": auth,
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

    def _jira_url(self, path: str) -> str:
        base = (self.settings.JIRA_BASE_URL or "").rstrip("/")
        if not path.startswith("/"):
            path = f"/{path}"
        return f"{base}{path}"

    def jira_browse_url(self, issue_key: str) -> str:
        """Build the human-facing URL for an issue (used by the frontend
        to render an "Open in JIRA" link). Safe to call without making
        any HTTP request — returns an empty string if JIRA isn't
        configured."""
        if not self.settings.JIRA_BASE_URL or not issue_key:
            return ""
        return f"{self.settings.JIRA_BASE_URL.rstrip('/')}/browse/{issue_key}"

    @staticmethod
    def _ok(resp: httpx.Response) -> None:
        if resp.status_code >= 300:
            # Don't echo upstream body to the API caller — it can leak
            # hostnames or token-prefixed error messages. Log full body
            # internally for debugging.
            logger.warning(
                "jira_request_failed",
                extra={
                    "status_code": resp.status_code,
                    "body_preview": resp.text[:500],
                },
            )
            raise IntegrationError(
                f"JIRA returned HTTP {resp.status_code}"
            )

    async def jira_create_issue(
        self,
        project_key: str,
        summary: str,
        description: str,
        issue_type: str = "Bug",
    ) -> dict[str, Any]:
        """Create a JIRA issue. Returns ``{key, id, self, url}`` on success."""
        self._ensure_jira_configured()
        if not project_key:
            raise ValidationError("project_key is required to create a JIRA issue")
        payload = {
            "fields": {
                "project": {"key": project_key},
                "summary": summary,
                "description": description or "",
                "issuetype": {"name": issue_type},
            }
        }
        try:
            async with httpx.AsyncClient(timeout=_JIRA_TIMEOUT_SECONDS) as client:
                resp = await client.post(
                    self._jira_url("/rest/api/2/issue"),
                    json=payload,
                    headers=self._jira_headers(),
                )
        except httpx.HTTPError as e:
            logger.warning("jira_create_issue_transport_error", extra={"err": str(e)})
            raise IntegrationError("Could not reach JIRA") from e

        self._ok(resp)
        data = resp.json()
        return {
            "key": data.get("key"),
            "id": data.get("id"),
            "self": data.get("self"),
            "url": self.jira_browse_url(data.get("key", "")),
        }

    async def jira_get_issue(self, issue_key: str) -> dict[str, Any]:
        """Fetch a JIRA issue. Returns the trimmed fields the frontend
        needs (key, summary, status, assignee, url) — not the entire
        JIRA payload."""
        self._ensure_jira_configured()
        if not issue_key:
            raise ValidationError("issue_key is required")
        try:
            async with httpx.AsyncClient(timeout=_JIRA_TIMEOUT_SECONDS) as client:
                resp = await client.get(
                    self._jira_url(f"/rest/api/2/issue/{issue_key}"),
                    headers=self._jira_headers(),
                )
        except httpx.HTTPError as e:
            logger.warning("jira_get_issue_transport_error", extra={"err": str(e)})
            raise IntegrationError("Could not reach JIRA") from e

        self._ok(resp)
        data = resp.json()
        fields = data.get("fields") or {}
        status = fields.get("status") or {}
        assignee = fields.get("assignee") or {}
        return {
            "key": data.get("key"),
            "id": data.get("id"),
            "summary": fields.get("summary"),
            "status": status.get("name"),
            "assignee": assignee.get("displayName"),
            "issue_type": (fields.get("issuetype") or {}).get("name"),
            "url": self.jira_browse_url(data.get("key", "")),
        }

    # ── GitHub Integration ──────────────────────────────────────────────
    #
    # Read-only browsing of commits and pull requests. Auth is a GitHub
    # Personal Access Token (classic or fine-grained) with at least
    # ``repo:read``. Self-hosted GitHub Enterprise works by setting
    # ``GITHUB_BASE_URL`` to its API root.
    #
    # We only proxy reads — we never write back to repos. Linking a
    # commit to a defect/test-case is a write on TCM's side and lives
    # on the existing CRUD routes, not here.

    def _ensure_github_configured(self) -> None:
        if not self.settings.GITHUB_TOKEN:
            raise ValidationError(
                "GitHub integration is not configured. Set GITHUB_TOKEN "
                "(and GITHUB_BASE_URL for GitHub Enterprise)."
            )

    def _github_headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.settings.GITHUB_TOKEN}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }

    def _github_api_url(self, path: str) -> str:
        base = (self.settings.GITHUB_BASE_URL or _GITHUB_DEFAULT_API).rstrip("/")
        if not path.startswith("/"):
            path = f"/{path}"
        return f"{base}{path}"

    def github_browse_url(self, repo_slug: str, sha: str = "") -> str:
        """Build the human-facing URL for a commit or repo. Used by the
        frontend to render "View on GitHub" links. Returns empty when
        unconfigured. ``repo_slug`` is ``owner/repo``."""
        if not self.settings.GITHUB_TOKEN or not repo_slug:
            return ""
        # github.com vs Enterprise: for the public service the API is
        # api.github.com but the browse URL is github.com.
        api = (self.settings.GITHUB_BASE_URL or _GITHUB_DEFAULT_API).rstrip("/")
        if api.endswith("api.github.com"):
            site = "https://github.com"
        elif "/api/v3" in api:
            site = api.split("/api/v3", 1)[0]
        else:
            # Best-effort fallback: strip trailing /api if present.
            site = api[: -len("/api")] if api.endswith("/api") else api
        if sha:
            return f"{site}/{repo_slug}/commit/{sha}"
        return f"{site}/{repo_slug}"

    @staticmethod
    def _github_ok(resp: httpx.Response) -> None:
        if resp.status_code >= 300:
            logger.warning(
                "github_request_failed",
                extra={
                    "status_code": resp.status_code,
                    "body_preview": resp.text[:500],
                },
            )
            raise IntegrationError(f"GitHub returned HTTP {resp.status_code}")

    @staticmethod
    def _validate_repo_slug(repo_slug: str) -> None:
        """Reject malformed slugs early — must be exactly
        ``owner/repo`` so we don't accidentally compose a URL like
        ``/repos//commits`` or one that escapes the API."""
        if not repo_slug or repo_slug.count("/") != 1:
            raise ValidationError(
                "repo must be in 'owner/repo' format"
            )
        owner, repo = repo_slug.split("/", 1)
        if not owner or not repo:
            raise ValidationError("repo must be in 'owner/repo' format")

    @staticmethod
    def _trim_commit(item: dict[str, Any]) -> dict[str, Any]:
        """Strip GitHub's verbose commit response down to what the UI
        actually shows. Keeps the response payload small and stable."""
        commit = item.get("commit") or {}
        author = commit.get("author") or {}
        gh_author = item.get("author") or {}
        return {
            "sha": item.get("sha"),
            "short_sha": (item.get("sha") or "")[:7],
            "message": (commit.get("message") or "").splitlines()[0][:255] if commit.get("message") else "",
            "author_name": author.get("name"),
            "author_email": author.get("email"),
            "author_login": gh_author.get("login") if isinstance(gh_author, dict) else None,
            "author_avatar_url": gh_author.get("avatar_url") if isinstance(gh_author, dict) else None,
            "authored_at": author.get("date"),
            "url": item.get("html_url"),
        }

    @staticmethod
    def _trim_pull(item: dict[str, Any]) -> dict[str, Any]:
        user = item.get("user") or {}
        head = item.get("head") or {}
        base = item.get("base") or {}
        return {
            "number": item.get("number"),
            "title": item.get("title"),
            "state": item.get("state"),
            "merged_at": item.get("merged_at"),
            "draft": item.get("draft"),
            "user_login": user.get("login") if isinstance(user, dict) else None,
            "user_avatar_url": user.get("avatar_url") if isinstance(user, dict) else None,
            "head_ref": head.get("ref") if isinstance(head, dict) else None,
            "base_ref": base.get("ref") if isinstance(base, dict) else None,
            "created_at": item.get("created_at"),
            "updated_at": item.get("updated_at"),
            "url": item.get("html_url"),
        }

    async def github_list_commits(
        self,
        repo_slug: str,
        *,
        branch: str | None = None,
        per_page: int = 25,
        page: int = 1,
    ) -> list[dict[str, Any]]:
        """List commits on a branch (or default branch). Returns trimmed
        records, not the full GitHub payload."""
        self._ensure_github_configured()
        self._validate_repo_slug(repo_slug)
        params: dict[str, Any] = {"per_page": per_page, "page": page}
        if branch:
            params["sha"] = branch
        try:
            async with httpx.AsyncClient(timeout=_GITHUB_TIMEOUT_SECONDS) as client:
                resp = await client.get(
                    self._github_api_url(f"/repos/{repo_slug}/commits"),
                    headers=self._github_headers(),
                    params=params,
                )
        except httpx.HTTPError as e:
            logger.warning("github_list_commits_transport_error", extra={"err": str(e)})
            raise IntegrationError("Could not reach GitHub") from e
        self._github_ok(resp)
        return [self._trim_commit(item) for item in resp.json()]

    async def github_get_commit(
        self,
        repo_slug: str,
        sha: str,
    ) -> dict[str, Any]:
        """Fetch a single commit. Trims to the same shape as the list
        endpoint plus a ``files_changed`` count."""
        self._ensure_github_configured()
        self._validate_repo_slug(repo_slug)
        if not sha:
            raise ValidationError("sha is required")
        try:
            async with httpx.AsyncClient(timeout=_GITHUB_TIMEOUT_SECONDS) as client:
                resp = await client.get(
                    self._github_api_url(f"/repos/{repo_slug}/commits/{sha}"),
                    headers=self._github_headers(),
                )
        except httpx.HTTPError as e:
            logger.warning("github_get_commit_transport_error", extra={"err": str(e)})
            raise IntegrationError("Could not reach GitHub") from e
        self._github_ok(resp)
        data = resp.json()
        trimmed = self._trim_commit(data)
        files = data.get("files") or []
        stats = data.get("stats") or {}
        trimmed["files_changed"] = len(files)
        trimmed["additions"] = stats.get("additions")
        trimmed["deletions"] = stats.get("deletions")
        return trimmed

    async def github_list_pulls(
        self,
        repo_slug: str,
        *,
        state: str = "open",
        per_page: int = 25,
        page: int = 1,
    ) -> list[dict[str, Any]]:
        """List pull requests. ``state`` is one of open / closed / all."""
        self._ensure_github_configured()
        self._validate_repo_slug(repo_slug)
        if state not in ("open", "closed", "all"):
            raise ValidationError("state must be one of: open, closed, all")
        try:
            async with httpx.AsyncClient(timeout=_GITHUB_TIMEOUT_SECONDS) as client:
                resp = await client.get(
                    self._github_api_url(f"/repos/{repo_slug}/pulls"),
                    headers=self._github_headers(),
                    params={"state": state, "per_page": per_page, "page": page},
                )
        except httpx.HTTPError as e:
            logger.warning("github_list_pulls_transport_error", extra={"err": str(e)})
            raise IntegrationError("Could not reach GitHub") from e
        self._github_ok(resp)
        return [self._trim_pull(item) for item in resp.json()]

    # ── Bitbucket Integration ───────────────────────────────────────────
    # Implementation deferred to Milestone 2 / Task 3.

    def _ensure_bitbucket_configured(self) -> None:
        if (
            not self.settings.BITBUCKET_BASE_URL
            or not self.settings.BITBUCKET_API_TOKEN
        ):
            raise ValidationError(
                "Bitbucket integration is not configured. Set BITBUCKET_BASE_URL "
                "and BITBUCKET_API_TOKEN env vars."
            )

    async def bitbucket_link_commit(
        self,
        repo_slug: str,
        commit_hash: str,
        entity_type: str,
        entity_id: str,
    ) -> dict[str, Any]:
        self._ensure_bitbucket_configured()
        raise NotImplementedError(
            "Bitbucket integration is part of Milestone 2 / Task 3 and isn't wired yet."
        )

    async def bitbucket_get_commits(
        self,
        repo_slug: str,
        branch: str = "main",
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        self._ensure_bitbucket_configured()
        raise NotImplementedError(
            "Bitbucket integration is part of Milestone 2 / Task 3 and isn't wired yet."
        )

    # ── CI Results Ingest ───────────────────────────────────────────────
    #
    # Receives a payload from a CI pipeline (Jenkins / GitHub Actions /
    # GitLab CI / Azure DevOps / etc.) describing the outcome of a
    # build's test run. Creates a TestRun directly in "Completed" state
    # and links Executions to existing test cases looked up by their
    # human-readable ``test_case_id`` (e.g. ``TC-PROJ-0001``).
    #
    # Per-result failures (test case not found / unrecognised status)
    # land in the ``failed`` array and never abort the whole batch —
    # same partial-success contract as every other bulk endpoint in
    # this codebase.

    # Map external status values to the canonical TestExecution.status
    # column. CI tools tend to use Pass/Fail/Skip; we accept either
    # the short or long form, lowercased or titled.
    _CI_STATUS_MAP: dict[str, str] = {
        "pass": "Pass",
        "passed": "Pass",
        "success": "Pass",
        "fail": "Fail",
        "failed": "Fail",
        "failure": "Fail",
        "error": "Fail",
        "blocked": "Blocked",
        "skip": "Skipped",
        "skipped": "Skipped",
    }

    async def ingest_ci_results(
        self,
        *,
        project_id: str,
        test_suite_id: str,
        run_name: str,
        environment: str | None,
        started_at: Any | None,
        completed_at: Any | None,
        results: list[dict[str, Any]],
        executed_by: str,
    ) -> dict[str, Any]:
        from datetime import datetime

        from app.models.project import Project
        from app.models.test_suite import TestSuite

        # Validate project exists.
        proj = await self.session.get(Project, project_id)
        if proj is None or proj.is_deleted:
            raise NotFoundError(f"Project '{project_id}' not found")

        # Validate suite exists, belongs to the project, and is active.
        suite = await self.session.get(TestSuite, test_suite_id)
        if suite is None or suite.is_deleted:
            raise NotFoundError(f"Test suite '{test_suite_id}' not found")
        if str(suite.project_id) != str(project_id):
            raise ValidationError(
                f"Test suite '{test_suite_id}' does not belong to project '{project_id}'"
            )

        from app.repositories.execution_repository import ExecutionRepository
        from app.repositories.test_case_repository import TestCaseRepository
        from app.repositories.test_run_repository import TestRunRepository

        run_repo = TestRunRepository(self.session)
        tc_repo = TestCaseRepository(self.session)
        exec_repo = ExecutionRepository(self.session)

        now = datetime.utcnow()
        started = started_at or now
        completed = completed_at or now

        # Create the run directly in "Completed" state — CI pipelines
        # always report after the work is done. Skip the workflow
        # transition machinery; just stamp the timestamps.
        run = await run_repo.create({
            "name": run_name,
            "test_suite_id": str(test_suite_id),
            "environment": environment,
            "status": "Completed",
            "started_at": started,
            "completed_at": completed,
            "created_by": str(executed_by),
        })

        succeeded: list[str] = []
        failed: list[dict[str, str]] = []

        for result in results:
            ext_id = (result.get("test_case_id") or "").strip()
            ext_status = (result.get("status") or "").strip().lower()
            error_message = result.get("error_message")
            duration_seconds = result.get("duration_seconds")

            if not ext_id:
                failed.append({
                    "test_case_id": ext_id,
                    "error": "Missing test_case_id in result",
                })
                continue

            mapped_status = self._CI_STATUS_MAP.get(ext_status)
            if mapped_status is None:
                failed.append({
                    "test_case_id": ext_id,
                    "error": (
                        f"Unrecognised status '{result.get('status')}' — "
                        f"expected one of: {sorted(set(self._CI_STATUS_MAP.values()))}"
                    ),
                })
                continue

            tc = await tc_repo.get_by_test_case_id(ext_id)
            # Constrain to the same project so a stray TC- id from
            # another project can't bleed in.
            if tc is None or str(tc.project_id) != str(project_id):
                failed.append({
                    "test_case_id": ext_id,
                    "error": f"Test case '{ext_id}' not found in project",
                })
                continue

            await exec_repo.create({
                "test_run_id": str(run.id),
                "test_case_id": str(tc.id),
                "status": mapped_status,
                "executed_by": str(executed_by),
                "executed_at": completed,
                "execution_time_seconds": (
                    int(duration_seconds) if isinstance(duration_seconds, (int, float)) else None
                ),
                "actual_result": error_message if mapped_status == "Fail" else None,
                "notes": error_message if mapped_status == "Fail" else None,
            })
            succeeded.append(ext_id)

        return {
            "test_run_id": str(run.id),
            "test_run_name": run.name,
            "status": run.status,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            "succeeded": succeeded,
            "failed": failed,
        }

    # ── AI Test Generator ───────────────────────────────────────────────
    # Out of scope for Milestone 2.

    async def generate_test_cases(
        self,
        requirement_text: str,
        test_type: str = "Functional",
        count: int = 5,
    ) -> list[dict[str, Any]]:
        raise NotImplementedError(
            "AI test case generation is not yet implemented. "
            "Configure an AI provider via env vars and implement here."
        )
