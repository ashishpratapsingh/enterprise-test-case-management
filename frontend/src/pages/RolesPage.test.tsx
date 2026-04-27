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

  it('rejects invalid permissions JSON without calling the service', async () => {
    render(
      <TestProviders>
        <RolesPage />
      </TestProviders>,
    );
    await waitFor(() => expect(roleService.getAll).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /new role/i }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText(/^name/i), {
      target: { value: 'Bad Role' },
    });
    fireEvent.change(within(dialog).getByLabelText(/permissions/i), {
      target: { value: 'not-json' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /create/i }));

    expect(await within(dialog).findByText(/valid json|object/i)).toBeInTheDocument();
    expect(roleService.create).not.toHaveBeenCalled();
  });

  it('submits a valid role and refetches the list', async () => {
    roleService.create.mockResolvedValue({
      id: 'r-3',
      name: 'QA Lead',
      description: 'Senior QA',
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
    fireEvent.change(within(dialog).getByLabelText(/permissions/i), {
      target: { value: '{"test_cases": ["read"]}' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /create/i }));

    await waitFor(() =>
      expect(roleService.create).toHaveBeenCalledWith({
        name: 'QA Lead',
        description: null,
        permissions: { test_cases: ['read'] },
      }),
    );
    // Refetch happens after a successful save.
    await waitFor(() => expect(roleService.getAll).toHaveBeenCalledTimes(2));
  });
});
