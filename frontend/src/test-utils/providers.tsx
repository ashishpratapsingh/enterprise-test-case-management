import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import { AuthContext, AuthContextType } from '../hooks/useAuth';
import ProjectContext, { ProjectOption } from '../contexts/ProjectContext';

export interface TestUser {
  id?: string;
  email?: string;
  full_name?: string;
  role?: string;
  role_name?: string;
}

export interface TestProvidersProps {
  children: React.ReactNode;
  user?: TestUser | null;
  projects?: ProjectOption[];
  initialRoute?: string;
}

/**
 * Wraps components with the providers pages normally rely on:
 * Router, Snackbar, AuthContext (stubbed user), ProjectContext (stubbed list).
 *
 * Pages don't fetch projects themselves — they read them off ProjectContext.
 * Supplying a list here removes the need to mock projectService in most cases.
 */
export const TestProviders: React.FC<TestProvidersProps> = ({
  children,
  user = { id: 'u-1', email: 'tester@tcm.com', full_name: 'Tester', role: 'admin', role_name: 'Admin' },
  projects = [],
  initialRoute = '/',
}) => {
  const authValue: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading: false,
    login: async () => {},
    logout: async () => {},
    hasRole: (...roles: string[]) => !!user && roles.includes(user.role || ''),
    refreshUser: async () => {},
  };

  return (
    <MemoryRouter initialEntries={[initialRoute]}>
      <SnackbarProvider>
        <AuthContext.Provider value={authValue}>
          <ProjectContext.Provider
            value={{ projects, loading: false, refreshProjects: async () => {} }}
          >
            {children}
          </ProjectContext.Provider>
        </AuthContext.Provider>
      </SnackbarProvider>
    </MemoryRouter>
  );
};
