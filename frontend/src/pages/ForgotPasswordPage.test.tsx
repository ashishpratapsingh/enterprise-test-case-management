import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TestProviders } from '../test-utils/providers';

jest.mock('../services/authService', () => ({
  __esModule: true,
  default: {
    requestPasswordReset: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const authService = require('../services/authService').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ForgotPasswordPage = require('./ForgotPasswordPage').default;

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the email form with a Send button', () => {
    render(
      <TestProviders>
        <ForgotPasswordPage />
      </TestProviders>,
    );
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });

  it('calls requestPasswordReset with the submitted email and shows success', async () => {
    authService.requestPasswordReset.mockResolvedValue({
      message: 'If that email is registered, a reset link has been issued.',
    });

    render(
      <TestProviders>
        <ForgotPasswordPage />
      </TestProviders>,
    );

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'tester@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => {
      expect(authService.requestPasswordReset).toHaveBeenCalledWith('tester@example.com');
    });
    expect(await screen.findByText(/reset link has been issued/i)).toBeInTheDocument();
  });

  it('never surfaces a reset_token even when the backend accidentally returns one', async () => {
    // Defence-in-depth: the frontend must not render the token even if the
    // backend regresses and starts echoing it. The only post-submit UI is
    // the generic success alert plus a Back-to-Login button.
    authService.requestPasswordReset.mockResolvedValue({
      message: 'ok',
      reset_token: 'should-never-be-rendered',
    });

    render(
      <TestProviders>
        <ForgotPasswordPage />
      </TestProviders>,
    );

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'tester@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    await screen.findByText(/reset link has been issued/i);
    expect(screen.queryByText(/should-never-be-rendered/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dev mode/i)).not.toBeInTheDocument();
  });

  it('shows an error alert when the service rejects', async () => {
    authService.requestPasswordReset.mockRejectedValue({
      response: { data: { message: 'backend down' } },
    });

    render(
      <TestProviders>
        <ForgotPasswordPage />
      </TestProviders>,
    );

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'tester@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByText(/backend down/i)).toBeInTheDocument();
  });
});
