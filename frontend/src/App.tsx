import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Layout from './components/common/Layout';
import ProtectedRoute from './components/common/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import RequirementsPage from './pages/RequirementsPage';
import TestCasesPage from './pages/TestCasesPage';
import TestCaseDetailPage from './pages/TestCaseDetailPage';
import TestSuitesPage from './pages/TestSuitesPage';
import TestRunsPage from './pages/TestRunsPage';
import ExecutionPage from './pages/ExecutionPage';
import DefectsPage from './pages/DefectsPage';
import ReportsPage from './pages/ReportsPage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import AuditPage from './pages/AuditPage';

const App: React.FC = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

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
  );
};

export default App;
