"""Integration service: stubs for JIRA, Bitbucket, and AI test generation.

All integrations are configurable via environment variables. Methods raise
NotImplementedError with a helpful message when the integration is not configured.
"""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings


class IntegrationService:
    """Provides integration stubs for external services.

    Each integration checks for required configuration before executing.
    If the necessary environment variables are not set, a clear
    NotImplementedError is raised explaining how to configure the integration.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.settings = get_settings()

    # ── JIRA Integration ────────────────────────────────────────────────

    def _ensure_jira_configured(self) -> None:
        """Check that JIRA integration is configured.

        Raises:
            NotImplementedError: If JIRA_BASE_URL or JIRA_API_TOKEN are not set.
        """
        if not self.settings.JIRA_BASE_URL or not self.settings.JIRA_API_TOKEN:
            raise NotImplementedError(
                "JIRA integration is not configured. "
                "Set JIRA_BASE_URL and JIRA_API_TOKEN environment variables "
                "to enable JIRA integration."
            )

    async def jira_create_issue(
        self,
        project_key: str,
        summary: str,
        description: str,
        issue_type: str = "Bug",
    ) -> dict[str, Any]:
        """Create a JIRA issue.

        Args:
            project_key: The JIRA project key (e.g., 'PROJ').
            summary: Issue summary / title.
            description: Detailed issue description.
            issue_type: JIRA issue type (default: 'Bug').

        Returns:
            Dict with created issue details (key, id, self_url).

        Raises:
            NotImplementedError: If JIRA is not configured.
        """
        self._ensure_jira_configured()

        # TODO: Implement actual JIRA API call using httpx/aiohttp
        # POST {JIRA_BASE_URL}/rest/api/2/issue
        raise NotImplementedError(
            "JIRA create_issue is configured but not yet implemented. "
            "Replace this stub with an HTTP call to the JIRA REST API."
        )

    async def jira_get_issue(self, issue_key: str) -> dict[str, Any]:
        """Get a JIRA issue by key.

        Args:
            issue_key: The JIRA issue key (e.g., 'PROJ-123').

        Returns:
            Dict with issue details.

        Raises:
            NotImplementedError: If JIRA is not configured.
        """
        self._ensure_jira_configured()

        # TODO: Implement actual JIRA API call
        # GET {JIRA_BASE_URL}/rest/api/2/issue/{issue_key}
        raise NotImplementedError(
            "JIRA get_issue is configured but not yet implemented. "
            "Replace this stub with an HTTP call to the JIRA REST API."
        )

    async def jira_sync_status(
        self,
        issue_key: str,
        status: str,
    ) -> dict[str, Any]:
        """Synchronize status between the local system and JIRA.

        Args:
            issue_key: The JIRA issue key.
            status: The new status to set.

        Returns:
            Dict with sync result details.

        Raises:
            NotImplementedError: If JIRA is not configured.
        """
        self._ensure_jira_configured()

        # TODO: Implement JIRA status transition
        # POST {JIRA_BASE_URL}/rest/api/2/issue/{issue_key}/transitions
        raise NotImplementedError(
            "JIRA sync_status is configured but not yet implemented. "
            "Replace this stub with an HTTP call to the JIRA REST API."
        )

    # ── Bitbucket Integration ───────────────────────────────────────────

    def _ensure_bitbucket_configured(self) -> None:
        """Check that Bitbucket integration is configured.

        Raises:
            NotImplementedError: If BITBUCKET_BASE_URL or BITBUCKET_API_TOKEN are not set.
        """
        if (
            not self.settings.BITBUCKET_BASE_URL
            or not self.settings.BITBUCKET_API_TOKEN
        ):
            raise NotImplementedError(
                "Bitbucket integration is not configured. "
                "Set BITBUCKET_BASE_URL and BITBUCKET_API_TOKEN environment variables "
                "to enable Bitbucket integration."
            )

    async def bitbucket_link_commit(
        self,
        repo_slug: str,
        commit_hash: str,
        entity_type: str,
        entity_id: str,
    ) -> dict[str, Any]:
        """Link a Bitbucket commit to a local entity.

        Args:
            repo_slug: The Bitbucket repository slug.
            commit_hash: The commit SHA hash.
            entity_type: The local entity type (e.g., 'test_case', 'defect').
            entity_id: The local entity UUID as string.

        Returns:
            Dict with link result details.

        Raises:
            NotImplementedError: If Bitbucket is not configured.
        """
        self._ensure_bitbucket_configured()

        # TODO: Implement Bitbucket API call
        raise NotImplementedError(
            "Bitbucket link_commit is configured but not yet implemented. "
            "Replace this stub with an HTTP call to the Bitbucket REST API."
        )

    async def bitbucket_get_commits(
        self,
        repo_slug: str,
        branch: str = "main",
        limit: int = 25,
    ) -> list[dict[str, Any]]:
        """Get recent commits from a Bitbucket repository.

        Args:
            repo_slug: The Bitbucket repository slug.
            branch: Branch name (default: 'main').
            limit: Maximum number of commits to return.

        Returns:
            List of commit detail dicts.

        Raises:
            NotImplementedError: If Bitbucket is not configured.
        """
        self._ensure_bitbucket_configured()

        # TODO: Implement Bitbucket API call
        # GET {BITBUCKET_BASE_URL}/rest/api/1.0/projects/.../repos/{repo}/commits
        raise NotImplementedError(
            "Bitbucket get_commits is configured but not yet implemented. "
            "Replace this stub with an HTTP call to the Bitbucket REST API."
        )

    # ── AI Test Generator ───────────────────────────────────────────────

    async def generate_test_cases(
        self,
        requirement_text: str,
        test_type: str = "Functional",
        count: int = 5,
    ) -> list[dict[str, Any]]:
        """Generate test cases from a requirement description using AI.

        This is a stub that will be replaced with an actual AI/LLM integration.

        Args:
            requirement_text: The requirement description to generate tests from.
            test_type: The type of test cases to generate (default: 'Functional').
            count: Number of test cases to generate.

        Returns:
            List of generated test case dicts with title, description, steps, etc.

        Raises:
            NotImplementedError: Always, until an AI provider is configured.
        """
        # TODO: Integrate with an AI service (OpenAI, Claude, etc.)
        # configured via environment variables (e.g., AI_API_KEY, AI_MODEL).
        raise NotImplementedError(
            "AI test case generation is not yet implemented. "
            "To enable this feature, configure an AI provider via environment "
            "variables (e.g., AI_API_KEY, AI_PROVIDER) and implement the "
            "integration in this method."
        )
