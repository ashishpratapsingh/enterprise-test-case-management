// ── User & Auth ──────────────────────────────────────────────────────────────

// Backend-aligned role slugs (derived from Role.name lowercased with spaces → _)
export type UserRole =
  | 'admin'
  | 'qa_head'
  | 'qa_engineer'
  | 'developer'
  | 'viewer'
  | 'auditor';

export interface Role {
  id: string;
  name: string;
  description?: string | null;
  permissions?: Record<string, string[]> | null;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  role_id: string;
  role_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ── Project ──────────────────────────────────────────────────────────────────

export interface Project {
  id: string | number;
  name: string;
  code: string;
  description: string;
  isActive: boolean;
  ownerId: string | number;
  owner?: User;
  createdAt: string;
  updatedAt: string;
}

// ── Module ───────────────────────────────────────────────────────────────────

export interface Module {
  id: number;
  name: string;
  description: string;
  projectId: number;
  parentModuleId: number | null;
  createdAt: string;
  updatedAt: string;
}

// ── Release ──────────────────────────────────────────────────────────────────

export interface Release {
  id: number;
  name: string;
  version: string;
  description: string;
  projectId: number;
  startDate: string;
  endDate: string;
  status: 'planned' | 'in_progress' | 'released';
  createdAt: string;
  updatedAt: string;
}

// ── Requirement ──────────────────────────────────────────────────────────────

export interface Requirement {
  id: number;
  title: string;
  description: string;
  projectId: number;
  moduleId: number | null;
  externalId: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'draft' | 'approved' | 'implemented';
  createdAt: string;
  updatedAt: string;
}

// ── Test Case ────────────────────────────────────────────────────────────────

export type TestCaseStatus = 'draft' | 'passed' | 'failed' | 'blocked' | 'in_progress' | 'skipped' | 'review' | 'approved' | 'deprecated';
export type TestCaseType = 'functional' | 'regression' | 'smoke' | 'integration' | 'performance' | 'security' | 'usability' | 'api';
export type TestCasePriority = 'low' | 'medium' | 'high' | 'critical';

export interface TestStep {
  id: string | number;
  testCaseId: string | number;
  stepNumber: number;
  action: string;
  expectedResult: string;
  testData: string;
}

export interface TestCase {
  id: string | number;
  title: string;
  description: string;
  preconditions: string;
  projectId: string | number;
  moduleId: string | number | null;
  epic_id?: string | null;
  user_story_id?: string | null;
  requirementId: string | number | null;
  type: TestCaseType;
  priority: TestCasePriority;
  status: TestCaseStatus;
  estimatedTime: number | null;
  isAutomated: boolean;
  automationId: string | null;
  version: number;
  createdById: string | number;
  createdBy?: User;
  project?: Project;
  module?: Module;
  steps: TestStep[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TestCaseVersion {
  id: number;
  testCaseId: number;
  version: number;
  title: string;
  description: string;
  steps: TestStep[];
  changedById: number;
  changedBy?: User;
  changeNote: string;
  createdAt: string;
}

// ── Test Suite ───────────────────────────────────────────────────────────────

export interface TestSuite {
  id: number;
  name: string;
  description: string;
  projectId: number;
  project?: Project;
  testCases: TestCase[];
  testCaseIds: number[];
  createdById: number;
  createdBy?: User;
  createdAt: string;
  updatedAt: string;
}

// ── Test Run ─────────────────────────────────────────────────────────────────

export type TestRunStatus = 'pending' | 'in_progress' | 'completed' | 'aborted';

export interface TestRun {
  id: number;
  name: string;
  description: string;
  projectId: number;
  project?: Project;
  suiteId: number;
  suite?: TestSuite;
  releaseId: number | null;
  release?: Release;
  assignedToId: number | null;
  assignedTo?: User;
  status: TestRunStatus;
  environment: string;
  startedAt: string | null;
  completedAt: string | null;
  totalCases: number;
  passedCount: number;
  failedCount: number;
  blockedCount: number;
  skippedCount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Test Execution ───────────────────────────────────────────────────────────

export type ExecutionStatus = 'not_run' | 'pass' | 'fail' | 'blocked' | 'skipped';

export interface StepResult {
  id: number;
  executionId: number;
  stepId: number;
  stepNumber: number;
  status: ExecutionStatus;
  actualResult: string;
  notes: string;
  screenshotUrl: string | null;
}

export interface TestExecution {
  id: number;
  testRunId: number;
  testCaseId: number;
  testCase?: TestCase;
  executedById: number | null;
  executedBy?: User;
  status: ExecutionStatus;
  notes: string;
  defectId: number | null;
  defect?: Defect;
  stepResults: StepResult[];
  startedAt: string | null;
  completedAt: string | null;
  executionTime: number | null;
  createdAt: string;
  updatedAt: string;
}

// ── Defect ───────────────────────────────────────────────────────────────────

export type DefectSeverity = 'low' | 'medium' | 'high' | 'critical';
export type DefectStatus = 'open' | 'in_progress' | 'resolved' | 'closed' | 'reopened';

export interface Defect {
  id: number;
  title: string;
  description: string;
  projectId: number;
  project?: Project;
  severity: DefectSeverity;
  status: DefectStatus;
  reportedById: number;
  reportedBy?: User;
  assignedToId: number | null;
  assignedTo?: User;
  testExecutionId: number | null;
  externalTrackerId: string | null;
  stepsToReproduce: string;
  environment: string;
  createdAt: string;
  updatedAt: string;
}

// ── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLog {
  id: string;
  user_id: string | null;
  user_name?: string | null;
  user_email?: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ── API Response Wrappers ────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message: string;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardMetrics {
  totalProjects: number;
  totalTestCases: number;
  totalTestRuns: number;
  totalDefects: number;
  testCasesByStatus: { status: string; count: number }[];
  testCasesByPriority: { priority: string; count: number }[];
  executionResults: { status: string; count: number }[];
  automationCoverage: { automated: number; manual: number };
  executionTrend: { date: string; passed: number; failed: number; blocked: number }[];
  defectsByStatus: { status: string; count: number }[];
  defectsBySeverity: { severity: string; count: number }[];
  releaseReadiness: { release: string; total: number; passed: number; failed: number; remaining: number }[];
  recentActivity: { id: number; action: string; entity: string; user: string; timestamp: string }[];
}
