import React from 'react';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { TestProviders } from '../test-utils/providers';

jest.mock('../components/common/DataTable', () => {
  const mod = require('../test-utils/mockDataTable');
  return { __esModule: true, default: mod.default };
});

jest.mock('../services/epicService', () => ({
  __esModule: true,
  default: { getAll: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
}));
jest.mock('../services/userStoryService', () => ({
  __esModule: true,
  default: { getAll: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
}));
jest.mock('../services/userService', () => ({
  __esModule: true,
  default: { getAll: jest.fn() },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const epicService = require('../services/epicService').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const userStoryService = require('../services/userStoryService').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const userService = require('../services/userService').default;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const RequirementsPage = require('./RequirementsPage').default;

const sampleEpics = [
  { id: 'e-1', title: 'Auth revamp', priority: 'High', project_id: 'p-1', status: 'In Progress' },
  { id: 'e-2', title: 'Payments v2', priority: 'Medium', project_id: 'p-1', status: 'Draft' },
];

const sampleStories = [
  { id: 's-1', title: 'MFA login', priority: 'High', project_id: 'p-1', epic_id: 'e-1', status: 'Ready' },
];

describe('RequirementsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    epicService.getAll.mockResolvedValue({ data: [sampleEpics, sampleEpics.length] });
    userStoryService.getAll.mockResolvedValue({ data: [sampleStories, sampleStories.length] });
    userService.getAll.mockResolvedValue({ data: [[], 0] });
  });

  it('renders Epics tab by default and fetches epics', async () => {
    render(
      <TestProviders>
        <RequirementsPage />
      </TestProviders>,
    );

    expect(screen.getByRole('tab', { name: /^epics$/i })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(epicService.getAll).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('Auth revamp')).toBeInTheDocument());
  });

  it('switches to User Stories tab and fetches stories', async () => {
    render(
      <TestProviders>
        <RequirementsPage />
      </TestProviders>,
    );
    await waitFor(() => expect(epicService.getAll).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('tab', { name: /user stories/i }));

    await waitFor(() => expect(userStoryService.getAll).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText('MFA login')).toBeInTheDocument());
  });

  it('typing in the epic search triggers a refetch with the search term', async () => {
    render(
      <TestProviders>
        <RequirementsPage />
      </TestProviders>,
    );
    await waitFor(() => expect(epicService.getAll).toHaveBeenCalled());

    // There are two "Search title..." inputs — one per tab; pick the first (Epics tab).
    const searchInputs = screen.getAllByPlaceholderText(/search title/i);
    const searchInput = searchInputs[0];
    fireEvent.change(searchInput, { target: { value: 'auth' } });

    await waitFor(() => {
      const hasAuth = epicService.getAll.mock.calls.some(
        (args: any[]) => args[0]?.search === 'auth',
      );
      expect(hasAuth).toBe(true);
    });
  });

  it('opens the New Epic dialog when editor clicks the button', async () => {
    render(
      <TestProviders>
        <RequirementsPage />
      </TestProviders>,
    );
    await waitFor(() => expect(epicService.getAll).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: /new epic/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/new epic/i)).toBeInTheDocument();
  });

  it('hides New Epic / New User Story buttons for non-editor roles', async () => {
    render(
      <TestProviders user={{ id: 'v-1', email: 'v@tcm.com', role: 'viewer', role_name: 'Viewer' }}>
        <RequirementsPage />
      </TestProviders>,
    );
    await waitFor(() => expect(epicService.getAll).toHaveBeenCalled());

    expect(screen.queryByRole('button', { name: /new epic/i })).not.toBeInTheDocument();
  });

  // Regression test for the "newly-created epic missing from User Story
  // dropdown" bug. Before the fix, allEpics was loaded once on mount and
  // never re-fetched after epic create, so a user who created an epic in
  // the same session couldn't pick it when creating a user story. The
  // component now loads a "full list" view (pageSize 10000) on mount AND
  // after every epic create/update/delete.
  it('loads the full epic list for dropdowns on mount', async () => {
    render(
      <TestProviders>
        <RequirementsPage />
      </TestProviders>,
    );
    // Wait until at least one call has been made, then inspect the set of
    // calls — one of them must be the full-list signature used by the
    // dropdown loader.
    await waitFor(() => expect(epicService.getAll).toHaveBeenCalled());
    const fullListCall = epicService.getAll.mock.calls.find(
      (args: any[]) => args[0]?.pageSize === 10000,
    );
    expect(fullListCall).toBeDefined();
  });

});
