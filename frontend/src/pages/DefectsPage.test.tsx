import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { TestProviders } from '../test-utils/providers';

// ── Mocks ─────────────────────────────────────────────────────────────────
// DataTable is replaced with a simple DOM-friendly stub for JSDOM.
jest.mock('../components/common/DataTable', () => {
  const mod = require('../test-utils/mockDataTable');
  return { __esModule: true, default: mod.default };
});

jest.mock('../services/defectService', () => ({
  __esModule: true,
  default: {
    getAll: jest.fn(),
    getById: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    transitionStatus: jest.fn(),
    uploadAttachment: jest.fn(),
    getAttachments: jest.fn(),
    deleteAttachment: jest.fn(),
    bulkDelete: jest.fn(),
    bulkTransitionStatus: jest.fn(),
    bulkAssign: jest.fn(),
  },
}));

jest.mock('../services/testCaseService', () => ({
  __esModule: true,
  default: { getAll: jest.fn() },
}));
jest.mock('../services/epicService', () => ({
  __esModule: true,
  default: { getAll: jest.fn() },
}));
jest.mock('../services/userStoryService', () => ({
  __esModule: true,
  default: { getAll: jest.fn() },
}));
jest.mock('../services/userService', () => ({
  __esModule: true,
  default: { getAll: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const defectService = require('../services/defectService').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const testCaseService = require('../services/testCaseService').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const epicService = require('../services/epicService').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const userStoryService = require('../services/userStoryService').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const userService = require('../services/userService').default;

// Must import DefectsPage AFTER the mocks so its imports pick them up.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const DefectsPage = require('./DefectsPage').default;

const sampleDefects = [
  {
    id: 'd-1',
    defect_id: 'BUG-PRJ-0001',
    title: 'Login broken',
    severity: 'High',
    priority: 'High',
    status: 'Open',
    project: { id: 'p-1', name: 'Proj A', code: 'PRJ' },
    reporter: { full_name: 'Tester' },
    assignee: null,
    created_at: '2026-04-22T10:00:00Z',
  },
  {
    id: 'd-2',
    defect_id: 'BUG-PRJ-0002',
    title: 'Logout crash',
    severity: 'Critical',
    priority: 'Critical',
    status: 'In Progress',
    project: { id: 'p-1', name: 'Proj A', code: 'PRJ' },
    reporter: { full_name: 'Tester' },
    assignee: null,
    created_at: '2026-04-22T11:00:00Z',
  },
];

describe('DefectsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    defectService.getAll.mockResolvedValue({ items: sampleDefects, total: sampleDefects.length });
    testCaseService.getAll.mockResolvedValue({ data: [[], 0] });
    epicService.getAll.mockResolvedValue({ data: [[], 0] });
    userStoryService.getAll.mockResolvedValue({ data: [[], 0] });
    userService.getAll.mockResolvedValue({ data: [[], 0] });
  });

  it('renders heading and fetches the defect list on mount', async () => {
    render(
      <TestProviders>
        <DefectsPage />
      </TestProviders>,
    );

    expect(screen.getByRole('heading', { name: /defects/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(defectService.getAll).toHaveBeenCalled();
    });
    // Rows appear via our mock DataTable
    await waitFor(() => {
      expect(screen.getByTestId('data-table-row-count')).toHaveTextContent('2');
    });
  });

  it('shows each defect title in the table', async () => {
    render(
      <TestProviders>
        <DefectsPage />
      </TestProviders>,
    );
    await waitFor(() => expect(screen.getByText('Login broken')).toBeInTheDocument());
    expect(screen.getByText('Logout crash')).toBeInTheDocument();
  });

  it('typing in the search box triggers a refetch with the search param', async () => {
    render(
      <TestProviders>
        <DefectsPage />
      </TestProviders>,
    );
    await waitFor(() => expect(defectService.getAll).toHaveBeenCalledTimes(1));

    const searchInput = screen.getByPlaceholderText(/search title/i);
    fireEvent.change(searchInput, { target: { value: 'login' } });

    await waitFor(() => {
      const calls = defectService.getAll.mock.calls;
      const hasSearch = calls.some((args: any[]) => args[0]?.search === 'login');
      expect(hasSearch).toBe(true);
    });
  });

  it('opens the New Defect dialog when clicking the button', async () => {
    render(
      <TestProviders>
        <DefectsPage />
      </TestProviders>,
    );
    await waitFor(() => expect(defectService.getAll).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /new defect/i }));

    // Dialog shows the "New Defect" title
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/new defect/i)).toBeInTheDocument();
  });

  it('hides the New Defect button for non-editor roles', async () => {
    render(
      <TestProviders user={{ id: 'v-1', email: 'v@tcm.com', role: 'viewer', role_name: 'Viewer' }}>
        <DefectsPage />
      </TestProviders>,
    );
    await waitFor(() => expect(defectService.getAll).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /new defect/i })).not.toBeInTheDocument();
  });

  // ── Bulk operations ─────────────────────────────────────────────────────

  it('shows the bulk action bar only after a row is selected', async () => {
    render(
      <TestProviders>
        <DefectsPage />
      </TestProviders>,
    );
    await waitFor(() => expect(defectService.getAll).toHaveBeenCalled());

    // Bar is hidden initially.
    expect(screen.queryByRole('toolbar', { name: /bulk actions/i })).not.toBeInTheDocument();

    // Tick the first row's checkbox.
    fireEvent.click(screen.getByLabelText('select-row-d-1'));
    const bar = await screen.findByRole('toolbar', { name: /bulk actions/i });
    expect(within(bar).getByText(/1 selected/i)).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
  });

  it('non-editor never sees row checkboxes or the bulk bar', async () => {
    render(
      <TestProviders user={{ id: 'v-1', email: 'v@tcm.com', role: 'viewer', role_name: 'Viewer' }}>
        <DefectsPage />
      </TestProviders>,
    );
    await waitFor(() => expect(defectService.getAll).toHaveBeenCalled());
    expect(screen.queryByLabelText('select-row-d-1')).not.toBeInTheDocument();
    expect(screen.queryByText(/selected$/i)).not.toBeInTheDocument();
  });

  it('bulk delete calls the service with the selected IDs and refetches', async () => {
    defectService.bulkDelete.mockResolvedValue({ succeeded: ['d-1', 'd-2'], failed: [] });

    render(
      <TestProviders>
        <DefectsPage />
      </TestProviders>,
    );
    await waitFor(() => expect(defectService.getAll).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByLabelText('select-row-d-1'));
    fireEvent.click(screen.getByLabelText('select-row-d-2'));
    const bar = await screen.findByRole('toolbar', { name: /bulk actions/i });
    expect(within(bar).getByText(/2 selected/i)).toBeInTheDocument();

    fireEvent.click(within(bar).getByRole('button', { name: /^delete$/i }));
    // Confirm dialog → click the Delete inside it.
    const confirmDialog = await screen.findByRole('dialog');
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^delete$/i }));

    await waitFor(() =>
      expect(defectService.bulkDelete).toHaveBeenCalledWith(['d-1', 'd-2']),
    );
    await waitFor(() => expect(defectService.getAll).toHaveBeenCalledTimes(2));
  });

  it('bulk status transition through the bulk-update dialog sends the chosen status', async () => {
    defectService.bulkTransitionStatus.mockResolvedValue({
      succeeded: ['d-1'],
      failed: [],
    });

    render(
      <TestProviders>
        <DefectsPage />
      </TestProviders>,
    );
    await waitFor(() => expect(defectService.getAll).toHaveBeenCalled());

    // Open the JIRA-style bulk-update dialog from the action bar.
    fireEvent.click(screen.getByLabelText('select-row-d-1'));
    const bar = await screen.findByRole('toolbar', { name: /bulk actions/i });
    fireEvent.click(within(bar).getByRole('button', { name: /bulk update/i }));

    const dialog = await screen.findByRole('dialog', { name: /bulk update/i });

    // Tick "Change status" then pick "In Progress" from the dialog's
    // own Status dropdown. The Select carries a stable aria-label so
    // it can be located unambiguously among the other field selects.
    fireEvent.click(within(dialog).getByLabelText(/change status/i));
    fireEvent.mouseDown(within(dialog).getByLabelText('Bulk status selector'));
    const listbox = await screen.findByRole('listbox');
    fireEvent.click(within(listbox).getByRole('option', { name: /^in progress$/i }));

    fireEvent.click(within(dialog).getByRole('button', { name: /^apply to/i }));

    await waitFor(() =>
      expect(defectService.bulkTransitionStatus).toHaveBeenCalledWith(
        ['d-1'],
        'In Progress',
      ),
    );
  });
});
