import api from './api';

const PREFIX = '/integrations';

export interface JiraConfig {
  configured: boolean;
  base_url: string;
  default_project_key: string;
}

export interface JiraIssue {
  key: string;
  id?: string;
  summary?: string;
  status?: string;
  assignee?: string;
  issue_type?: string;
  url: string;
  linked_to?: string | null;
}

export const integrationService = {
  /** Cached on first hit so repeated defect-view opens don't re-fetch. */
  _jiraConfigCache: null as Promise<JiraConfig> | null,

  getJiraConfig(force = false): Promise<JiraConfig> {
    if (force) this._jiraConfigCache = null;
    if (!this._jiraConfigCache) {
      this._jiraConfigCache = api
        .get(`${PREFIX}/jira/config`)
        .then((r) => r.data.data as JiraConfig)
        .catch(() => ({ configured: false, base_url: '', default_project_key: '' }));
    }
    return this._jiraConfigCache;
  },

  /** Build a browse URL purely client-side once we know the base URL. */
  buildJiraBrowseUrl(baseUrl: string, issueKey: string): string {
    if (!baseUrl || !issueKey) return '';
    return `${baseUrl.replace(/\/$/, '')}/browse/${encodeURIComponent(issueKey)}`;
  },

  async getJiraIssue(issueKey: string): Promise<JiraIssue> {
    const r = await api.get(`${PREFIX}/jira/issues/${encodeURIComponent(issueKey)}`);
    return r.data.data as JiraIssue;
  },

  async createJiraIssue(payload: {
    project_key: string;
    summary: string;
    description?: string;
    issue_type?: string;
    defect_id?: string;
    test_case_id?: string;
  }): Promise<JiraIssue> {
    const r = await api.post(`${PREFIX}/jira/issues`, payload);
    return r.data.data as JiraIssue;
  },

  // ── GitHub ─────────────────────────────────────────────────────────
  _githubConfigCache: null as Promise<GithubConfig> | null,

  getGithubConfig(force = false): Promise<GithubConfig> {
    if (force) this._githubConfigCache = null;
    if (!this._githubConfigCache) {
      this._githubConfigCache = api
        .get(`${PREFIX}/github/config`)
        .then((r) => r.data.data as GithubConfig)
        .catch(() => ({ configured: false, default_repo: '', browse_base_url: '' }));
    }
    return this._githubConfigCache;
  },

  async listGithubCommits(params: {
    repo: string;
    branch?: string;
    perPage?: number;
    page?: number;
  }): Promise<GithubCommit[]> {
    const r = await api.get(`${PREFIX}/github/commits`, {
      params: {
        repo: params.repo,
        branch: params.branch,
        per_page: params.perPage,
        page: params.page,
      },
    });
    return r.data.data as GithubCommit[];
  },

  async getGithubCommit(repo: string, sha: string): Promise<GithubCommit> {
    const r = await api.get(
      `${PREFIX}/github/commits/${encodeURIComponent(sha)}`,
      { params: { repo } },
    );
    return r.data.data as GithubCommit;
  },

  async listGithubPulls(params: {
    repo: string;
    state?: 'open' | 'closed' | 'all';
    perPage?: number;
    page?: number;
  }): Promise<GithubPull[]> {
    const r = await api.get(`${PREFIX}/github/pulls`, {
      params: {
        repo: params.repo,
        state: params.state || 'open',
        per_page: params.perPage,
        page: params.page,
      },
    });
    return r.data.data as GithubPull[];
  },
};

export interface GithubConfig {
  configured: boolean;
  default_repo: string;
  browse_base_url: string;
}

export interface GithubCommit {
  sha: string;
  short_sha: string;
  message: string;
  author_name: string | null;
  author_email: string | null;
  author_login: string | null;
  author_avatar_url: string | null;
  authored_at: string | null;
  url: string | null;
  files_changed?: number;
  additions?: number;
  deletions?: number;
}

export interface GithubPull {
  number: number;
  title: string;
  state: string;
  merged_at: string | null;
  draft: boolean;
  user_login: string | null;
  user_avatar_url: string | null;
  head_ref: string | null;
  base_ref: string | null;
  created_at: string;
  updated_at: string;
  url: string;
}

export default integrationService;
