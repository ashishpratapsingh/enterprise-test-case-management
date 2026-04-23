import { UserRole } from '../types';

/**
 * Role hierarchy — higher number means more privilege.
 * Aligned with the six backend roles (Admin, QA Head, QA Engineer, Developer,
 * Viewer, Auditor). Auditor sits slightly above Viewer because of audit-log
 * visibility but has no write permissions.
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 100,
  qa_head: 80,
  qa_engineer: 60,
  developer: 40,
  auditor: 30,
  viewer: 20,
};

export function hasPermission(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  return requiredRoles.includes(userRole);
}

/** Can create/update test cases, suites, runs, etc. */
export function canEdit(userRole: UserRole): boolean {
  return hasPermission(userRole, ['admin', 'qa_head', 'qa_engineer']);
}

/** Can approve test cases / release gates. */
export function canApprove(userRole: UserRole): boolean {
  return hasPermission(userRole, ['admin', 'qa_head']);
}

/** Can execute test runs and log defects. */
export function canExecute(userRole: UserRole): boolean {
  return hasPermission(userRole, ['admin', 'qa_head', 'qa_engineer']);
}

/** Only admins can CRUD users and assign roles. */
export function canManageUsers(userRole: UserRole): boolean {
  return userRole === 'admin';
}

/** Admin + Auditor see the audit log. */
export function canViewAudit(userRole: UserRole): boolean {
  return hasPermission(userRole, ['admin', 'auditor']);
}

/** Only admin + qa_head can permanently remove entities. */
export function canDelete(userRole: UserRole): boolean {
  return hasPermission(userRole, ['admin', 'qa_head']);
}

export function isRoleAtLeast(userRole: UserRole, minimumRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[minimumRole] ?? 0);
}

/** Convert a role name like "QA Head" → "qa_head" (backend slug form). */
export function roleSlug(name: string): UserRole {
  return name.toLowerCase().replace(/\s+/g, '_') as UserRole;
}
