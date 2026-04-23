import {
  hasPermission,
  canEdit,
  canApprove,
  canExecute,
  canManageUsers,
  canViewAudit,
  canDelete,
  isRoleAtLeast,
  roleSlug,
} from './roleGuard';

describe('hasPermission', () => {
  it('returns true when role is in allowed list', () => {
    expect(hasPermission('admin', ['admin', 'qa_head'])).toBe(true);
  });
  it('returns false when role is not in list', () => {
    expect(hasPermission('viewer', ['admin', 'qa_head'])).toBe(false);
  });
});

describe('canEdit', () => {
  it.each([
    ['admin', true],
    ['qa_head', true],
    ['qa_engineer', true],
    ['developer', false],
    ['viewer', false],
    ['auditor', false],
  ] as const)('canEdit(%s) = %s', (role, expected) => {
    expect(canEdit(role as any)).toBe(expected);
  });
});

describe('canApprove', () => {
  it('admin and qa_head can approve', () => {
    expect(canApprove('admin')).toBe(true);
    expect(canApprove('qa_head')).toBe(true);
  });
  it('others cannot approve', () => {
    expect(canApprove('qa_engineer')).toBe(false);
    expect(canApprove('developer')).toBe(false);
    expect(canApprove('viewer')).toBe(false);
  });
});

describe('canExecute', () => {
  it('admin, qa_head, qa_engineer can execute', () => {
    expect(canExecute('admin')).toBe(true);
    expect(canExecute('qa_head')).toBe(true);
    expect(canExecute('qa_engineer')).toBe(true);
  });
  it('others cannot', () => {
    expect(canExecute('developer')).toBe(false);
    expect(canExecute('viewer')).toBe(false);
  });
});

describe('canManageUsers', () => {
  it('only admin', () => {
    expect(canManageUsers('admin')).toBe(true);
    expect(canManageUsers('qa_head')).toBe(false);
    expect(canManageUsers('viewer')).toBe(false);
  });
});

describe('canViewAudit', () => {
  it('admin and auditor only', () => {
    expect(canViewAudit('admin')).toBe(true);
    expect(canViewAudit('auditor')).toBe(true);
    expect(canViewAudit('qa_head')).toBe(false);
    expect(canViewAudit('viewer')).toBe(false);
  });
});

describe('canDelete', () => {
  it('admin and qa_head only', () => {
    expect(canDelete('admin')).toBe(true);
    expect(canDelete('qa_head')).toBe(true);
    expect(canDelete('qa_engineer')).toBe(false);
  });
});

describe('isRoleAtLeast', () => {
  it('returns true when user role has equal or higher rank', () => {
    expect(isRoleAtLeast('admin', 'qa_engineer')).toBe(true);
    expect(isRoleAtLeast('qa_head', 'qa_head')).toBe(true);
  });
  it('returns false when user role has lower rank', () => {
    expect(isRoleAtLeast('viewer', 'qa_engineer')).toBe(false);
    expect(isRoleAtLeast('developer', 'admin')).toBe(false);
  });
});

describe('roleSlug', () => {
  it('lowercases and replaces spaces with underscores', () => {
    expect(roleSlug('QA Head')).toBe('qa_head');
    expect(roleSlug('QA Engineer')).toBe('qa_engineer');
    expect(roleSlug('Admin')).toBe('admin');
  });
  it('handles multi-space input', () => {
    expect(roleSlug('QA  Engineer')).toBe('qa_engineer');
  });
});
