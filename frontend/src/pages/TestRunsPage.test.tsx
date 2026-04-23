import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { TestProviders } from '../test-utils/providers';

jest.mock('../components/common/DataTable', () => {
  const mod = require('../test-utils/mockDataTable');
  return { __esModule: true, default: mod.default };
});

jest.mock('../services/testRunService', () => ({
  __esModule: true,
  default: {
    getAll: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    start: jest.fn(),
    complete: jest.fn(),
    abort: jest.fn(),
    block: jest.fn(),
  },
}));

jest.mock('../services/testSuiteService', () => ({
  __esModule: true,
  default: { getAll: jest.fn() },
}));

jest.mock('../services/executionService', () => ({
  __esModule: true,
  default: {
    listDefects: jest.fn().mockResolvedValue([]),
    getByRunId: jest.fn().mockResolvedValue([]),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const testRunService = require('../services/testRunService').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const testSuiteService = require('../services/testSuiteService').default;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const TestRunsPage = require('./TestRunsPage').default;

const sampleRuns = [
  {
    id: 'r-1',
    name: 'Nightly — 2026-04-22',
    status: 'Not Started',
    environment: 'Staging',
    test_suite_id: 's-1',
    created_by: 'u-1',
    created_at: '2026-04-22T20:00:00Z',
    started_at: null,
    completed_at: null,
  },
  {
    id: 'r-2',
    name: 'Release smoke',
    status: 'In Progress',
    environment: 'Prod',
    test_suite_id: 's-1',
    created_by: 'u-1',
    created_at: '2026-04-22T20:30:00Z',
    started_at: '2026-04-22T21:00:00Z',
    completed_at: null,
  },
];

const sampleSuites = [
  { id: 's-1', name: 'Smoke', project_id: 'p-1', is_active: true },
];

describe('TestRunsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    testRunService.getAll.mockResolvedValue({
      data: [sampleRuns, sampleRuns.length],
    });
    testSuiteService.getAll.mockResolvedValue({
      data: [sampleSuites, sampleSuites.length],
    });
  });

  it('renders and fetches test runs on mount', async () => {
    render(
      <TestProviders>
        <TestRunsPage />
      </TestProviders>,
    );

    await waitFor(() => expect(testRunService.getAll).toHaveBeenCalled());
    await waitFor(() => {
      expect(screen.getByText('Nightly — 2026-04-22')).toBeInTheDocument();
    });
    expect(screen.getByText('Release smoke')).toBeInTheDocument();
  });

  it('typing in the search box refetches with the search term', async () => {
    render(
      <TestProviders>
        <TestRunsPage />
      </TestProviders>,
    );
    await waitFor(() => expect(testRunService.getAll).toHaveBeenCalled());

    const searchInput = screen.getByPlaceholderText(/search title/i);
    fireEvent.change(searchInput, { target: { value: 'smoke' } });

    await waitFor(() => {
      const hasSearch = testRunService.getAll.mock.calls.some(
        (args: any[]) => args[0]?.search === 'smoke',
      );
      expect(hasSearch).toBe(true);
    });
  });

  it('opens the New Test Run dialog when editor clicks the button', async () => {
    render(
      <TestProviders>
        <TestRunsPage />
      </TestProviders>,
    );
    await waitFor(() => expect(testRunService.getAll).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /new test run/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/new test run/i)).toBeInTheDocument();
  });

  it('hides New Test Run button for non-editor roles', async () => {
    render(
      <TestProviders user={{ id: 'v-1', email: 'v@tcm.com', role: 'viewer', role_name: 'Viewer' }}>
        <TestRunsPage />
      </TestProviders>,
    );
    await waitFor(() => expect(testRunService.getAll).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /new test run/i })).not.toBeInTheDocument();
  });
});
