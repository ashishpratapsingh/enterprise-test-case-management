import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import { LoginRequest } from '../types';
import authService from '../services/authService';

export interface AuthContextType {
  user: any | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: string[]) => boolean;
  refreshUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: async () => {},
  hasRole: () => false,
  refreshUser: async () => {},
});

export function useAuthProvider(): AuthContextType {
  const [user, setUser] = useState<any | null>(authService.getStoredUser());
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = useMemo(() => !!user && authService.isAuthenticated(), [user]);

  useEffect(() => {
    // On boot, if authenticated, refresh the cached profile from the server so
    // the stored role always reflects what's in the database. This corrects
    // any stale local storage left over from earlier builds.
    if (!authService.isAuthenticated()) {
      setIsLoading(false);
      return;
    }
    setUser(authService.getStoredUser());
    authService
      .getCurrentUser()
      .then((fresh) => setUser(fresh))
      .catch(() => {
        // Token invalid or network error — keep stored user as-is.
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (credentials: LoginRequest) => {
    const { user: loggedInUser } = await authService.login(credentials);
    setUser(loggedInUser);
  }, []);

  const logout = useCallback(async () => {
    await authService.logout();
    setUser(null);
  }, []);

  const hasRole = useCallback(
    (...roles: string[]) => {
      if (!user) return false;
      return roles.includes(user.role);
    },
    [user]
  );

  const refreshUser = useCallback(async () => {
    try {
      const fresh = await authService.getCurrentUser();
      setUser(fresh);
    } catch {
      setUser(authService.getStoredUser());
    }
  }, []);

  return { user, isAuthenticated, isLoading, login, logout, hasRole, refreshUser };
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default useAuth;
