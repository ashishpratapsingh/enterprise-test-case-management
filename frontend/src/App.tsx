import React, { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import Layout from './components/common/Layout';
import ProtectedRoute from './components/common/ProtectedRoute';

// Code-splitting: each top-level page is loaded on demand. The
// initial JS bundle now ships only the auth shell + AG Grid + MUI
// core, and individual page chunks (DefectsPage, ExecutionPage,
// etc.) stream in when the user navigates to them.
//
// LoginPage stays eager because it's the very first thing every user
// sees — lazy-loading would just add a flicker on cold start.
import LoginPage from './pages/LoginPage';

const ForgotPasswordPage = React.lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = React.lazy(() => import('./pages/ResetPasswordPage'));
const SsoCallbackPage = React.lazy(() => import('./pages/SsoCallbackPage'));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const ProjectsPage = React.lazy(() => import('./pages/ProjectsPage'));
const RequirementsPage = React.lazy(() => import('./pages/RequirementsPage'));
const TestCasesPage = React.lazy(() => import('./pages/TestCasesPage'));
const TestCaseDetailPage = React.lazy(() => import('./pages/TestCaseDetailPage'));
const TestSuitesPage = React.lazy(() => import('./pages/TestSuitesPage'));
const TestRunsPage = React.lazy(() => import('./pages/TestRunsPage'));
const ExecutionPage = React.lazy(() => import('./pages/ExecutionPage'));
const DefectsPage = React.lazy(() => import('./pages/DefectsPage'));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage'));
const UsersPage = React.lazy(() => import('./pages/UsersPage'));
const RolesPage = React.lazy(() => import('./pages/RolesPage'));
const AuditPage = React.lazy(() => import('./pages/AuditPage'));

// Spinner shown while a route chunk is loading. Centred in the
// viewport so it doesn't shift the Layout chrome around.
const RouteLoader: React.FC = () => (
  <Box
    display="flex"
    justifyContent="center"
    alignItems="center"
    minHeight="60vh"
  >
    <CircularProgress />
  </Box>
);

const App: React.FC = () => {
  return (
    <Suspense fallback={<RouteLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/sso/callback" element={<SsoCallbackPage />} />

        {/* All protected routes share the Layout shell */}
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/requirements" element={<RequirementsPage />} />
          <Route path="/test-cases" element={<TestCasesPage />} />
          <Route path="/test-cases/:id" element={<TestCaseDetailPage />} />
          <Route path="/test-suites" element={<TestSuitesPage />} />
          <Route path="/test-runs" element={<TestRunsPage />} />
          <Route path="/executions/:runId" element={<ExecutionPage />} />
          <Route path="/defects" element={<DefectsPage />} />
          <Route path="/reports" element={<ReportsPage />} />

          {/* Admin only */}
          <Route
            path="/users"
            element={
              <ProtectedRoute roles={['admin']}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/roles"
            element={
              <ProtectedRoute roles={['admin']}>
                <RolesPage />
              </ProtectedRoute>
            }
          />

          {/* Admin + Auditor */}
          <Route
            path="/audit"
            element={
              <ProtectedRoute roles={['admin', 'auditor']}>
                <AuditPage />
              </ProtectedRoute>
            }
          />
        </Route>
      </Routes>
    </Suspense>
  );
};

export default App;
