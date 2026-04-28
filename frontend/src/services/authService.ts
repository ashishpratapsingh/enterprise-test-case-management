import api from './api';
import { LoginRequest } from '../types';

const AUTH_PREFIX = '/auth';

/**
 * Normalize backend /users/me payload into the shape the rest of the UI
 * (role guards, layout, pages) expects. Includes both the raw role_name
 * (e.g. "QA Head") and the slug role (e.g. "qa_head").
 */
function normalizeProfile(raw: any, fallbackEmail?: string): any {
  const roleName: string = raw?.role_name || '';
  const roleSlug = roleName.toLowerCase().replace(/\s+/g, '_');
  return {
    id: raw?.id,
    email: raw?.email || fallbackEmail || '',
    full_name: raw?.full_name || raw?.email || '',
    role_id: raw?.role_id,
    role_name: roleName,
    role: roleSlug,
    is_active: raw?.is_active,
    created_at: raw?.created_at,
    updated_at: raw?.updated_at,
  };
}

export const authService = {
  async login(credentials: LoginRequest): Promise<{ user: any }> {
    const response = await api.post(`${AUTH_PREFIX}/login`, credentials);
    const data = response.data.data;

    // Backend returns: { access_token, refresh_token, token_type, user_id }
    localStorage.setItem('accessToken', data.access_token);
    localStorage.setItem('refreshToken', data.refresh_token);

    // Fetch the full profile so we capture the correct role. Fallback to a
    // minimal stub if /users/me is unreachable.
    let user: any;
    try {
      const meRes = await api.get('/users/me');
      user = normalizeProfile(meRes.data?.data, credentials.email);
    } catch {
      user = {
        id: data.user_id,
        email: credentials.email,
        role: '',
        role_name: '',
      };
    }
    localStorage.setItem('user', JSON.stringify(user));
    return { user };
  },

  async logout(): Promise<void> {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  },

  async refreshToken(): Promise<any> {
    const refreshToken = localStorage.getItem('refreshToken');
    const response = await api.post(`${AUTH_PREFIX}/refresh`, {
      refresh_token: refreshToken,
    });
    const data = response.data.data;
    localStorage.setItem('accessToken', data.access_token);
    if (data.refresh_token) {
      localStorage.setItem('refreshToken', data.refresh_token);
    }
    return data;
  },

  /**
   * Fetch the current user from the backend and refresh the cached copy.
   * Used on app boot to correct a stale stored role.
   */
  async getCurrentUser(): Promise<any> {
    const res = await api.get('/users/me');
    const user = normalizeProfile(res.data?.data);
    localStorage.setItem('user', JSON.stringify(user));
    return user;
  },

  /**
   * Initiate a password reset. Always resolves successfully; the backend
   * responds with the same generic message regardless of whether the email
   * is registered. In DEBUG mode, `data.reset_token` carries the plaintext
   * token so a dev can complete the flow without email infrastructure.
   */
  async requestPasswordReset(email: string): Promise<{ message: string; reset_token?: string }> {
    const res = await api.post(`${AUTH_PREFIX}/forgot-password`, { email });
    return res.data?.data || { message: 'OK' };
  },

  async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
    const res = await api.post(`${AUTH_PREFIX}/reset-password`, {
      token,
      new_password: newPassword,
    });
    return res.data?.data || { message: 'OK' };
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('accessToken');
  },

  getStoredToken(): string | null {
    return localStorage.getItem('accessToken');
  },

  getStoredUser(): any | null {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  // ── SSO (OIDC) ──────────────────────────────────────────────────────

  /** Public-ish config used by LoginPage to decide whether to render
   *  the "Sign in with SSO" button. No auth required. */
  async getSsoConfig(): Promise<{ enabled: boolean; provider_name: string; login_url: string }> {
    const res = await api.get(`${AUTH_PREFIX}/sso/config`);
    return res.data.data;
  },

  /** Drop the user at the backend's /sso/login (which redirects to
   *  the IdP). We do a hard navigate so the browser follows the
   *  307 redirect chain. */
  beginSsoLogin(returnTo?: string): void {
    const baseURL = (api.defaults.baseURL || '').replace(/\/$/, '');
    const params = returnTo ? `?return_to=${encodeURIComponent(returnTo)}` : '';
    window.location.assign(`${baseURL}${AUTH_PREFIX}/sso/login${params}`);
  },

  /**
   * Consume the JWTs the backend left in the URL fragment after a
   * successful SSO callback. Stores them, fetches the profile, and
   * caches the user — same shape as ``login`` so router code doesn't
   * branch.
   */
  async completeSsoLogin(fragment: string): Promise<{ user: any; returnTo: string }> {
    const params = new URLSearchParams(fragment.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const userId = params.get('user_id');
    const returnTo = params.get('return_to') || '/';
    if (!accessToken || !refreshToken || !userId) {
      throw new Error('Missing SSO tokens in callback');
    }
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    let user: any;
    try {
      const meRes = await api.get('/users/me');
      user = normalizeProfile(meRes.data?.data);
    } catch {
      user = { id: userId, email: '', role: '', role_name: '' };
    }
    localStorage.setItem('user', JSON.stringify(user));
    return { user, returnTo };
  },
};

export default authService;
