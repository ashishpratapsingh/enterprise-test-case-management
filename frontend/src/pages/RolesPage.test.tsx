import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { TestProviders } from '../test-utils/providers';

jest.mock('../components/common/DataTable', () => {
  const mod = require('../test-utils/mockDataTable');
  return { __esModule: true, default: mod.default };
});

jest.mock('../services/roleService', () => ({
  __esModule: true,
  default: {
    getAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const roleService = require('../services/roleService').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const RolesPage = require('./RolesPage').default;

const sampleRoles = [
  {
    id: 'r-1',
    name: 'Admin',
    description: 'Full access',
    permissions: { users: ['create', 'read'], roles: ['read'] },
  },
  {
    id: 'r-2',
    name: 'Viewer',
    description: 'Read only',
    permissions: null,
  },
];

describe('RolesPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    roleService.getAll.mockResolvedValue(sampleRoles);
  });

  it('lists roles fetched from the service', async () => {
    render(
      <TestProviders>
        <RolesPage />
      </TestProviders>,
    );
    await waitFor(() => expect(roleService.getAll).toHaveBeenCalled());
    expect(await screen.findByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('Viewer')).toBeInTheDocument();
  });

  it('admin sees the New Role button and can open the create dialog', async () => {
    render(
      <TestProviders>
        <RolesPage />
      </TestProviders>,
    );
    await waitFor(() => expect(roleService.getAll).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /new role/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/new role/i)).toBeInTheDocument();
    // Dialog has the empty Name field.
    expect(within(dialog).getByLabelText(/^name/i)).toHaveValue('');
  });

  it('hides the New Role button for non-admin users', async () => {
    render(
      <TestProviders user={{ id: 'u-1', email: 'qa@tcm.com', role: 'qa_engineer', role_name: 'QA Engineer' }}>
        <RolesPage />
      </TestProviders>,
    );
    await waitFor(() => expect(roleService.getAll).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /new role/i })).not.toBeInTheDocument();
  });

  it('renders the permission matrix in the create dialog', async () => {
    render(
      <TestProviders>
        <RolesPage />
      </TestProviders>,
    );
    await waitFor(() => expect(roleService.getAll).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /new role/i }));
    const dialog = await screen.findByRole('dialog');

    // Matrix renders as a labelled table with checkboxes per
    // resource × action pair. The accessible label proves the
    // PermissionMatrix component mounted instead of the old JSON
    // textarea.
    const matrix = within(dialog).getByLabelText(/permission matrix/i);
    expect(matrix).toBeInTheDocument();
    // At least one of the canonical action columns must show up.
    expect(within(matrix).getAllByText(/^create$/i).length).toBeGreaterThan(0);
  });

  it('submits a role with permissions toggled via the matrix', async () => {
    roleService.create.mockResolvedValue({
      id: 'r-3',
      name: 'QA Lead',
      description: null,
      permissions: { test_cases: ['read'] },
    });

    render(
      <TestProviders>
        <RolesPage />
      </TestProviders>,
    );
    await waitFor(() => expect(roleService.getAll).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /new role/i }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText(/^name/i), {
      target: { value: 'QA Lead' },
    });
    // Toggle the (test_cases × read) checkbox via its aria-label.
    fireEvent.click(within(dialog).getByLabelText('test_cases read'));

    fireEvent.click(within(dialog).getByRole('button', { name: /create/i }));

    await waitFor(() =>
      expect(roleService.create).toHaveBeenCalledWith({
        name: 'QA Lead',
        description: null,
        permissions: { test_cases: ['read'] },
      }),
    );
  });

  it('shows a compact summary in the permissions cell', async () => {
    render(
      <TestProviders>
        <RolesPage />
      </TestProviders>,
    );
    await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument());

    // Summary text is split across nodes (numbers are <strong>), so we
    // match the surrounding phrasing. Sample Admin role has 2 resources
    // and 3 total actions.
    const matches = screen.getAllByText((_content, node) => {
      if (!node) return false;
      const text = node.textContent || '';
      return /3\s*permissions across\s*2\s*resources/i.test(text);
    });
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.getByText(/no permissions/i)).toBeInTheDocument();
  });

  it('reveals the read-only permission matrix when the summary is focused', async () => {
    render(
      <TestProviders>
        <RolesPage />
      </TestProviders>,
    );
    await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument());

    // Each summary is exposed as a focusable element with an
    // aria-label that names the role's permission counts.
    const summary = screen.getByLabelText(
      /show permissions: 3 permissions across 2 resources/i,
    );
    summary.focus();

    // Tooltip mounts on focus and renders the same matrix the edit
    // dialog uses (just disabled). The matrix has aria-label
    // "Permission matrix".
    const matrix = await screen.findByLabelText(/permission matrix/i);
    expect(matrix).toBeInTheDocument();
  });
});
