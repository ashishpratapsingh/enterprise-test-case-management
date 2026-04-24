import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TestProviders } from '../test-utils/providers';

jest.mock('../services/authService', () => ({
  __esModule: true,
  default: {
    resetPassword: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const authService = require('../services/authService').default;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ResetPasswordPage = require('./ResetPasswordPage').default;

const renderWithToken = (token: string | null = 'the-token') => {
  const route = token === null ? '/reset-password' : `/reset-password?token=${token}`;
  return render(
    <TestProviders initialRoute={route}>
      <ResetPasswordPage />
    </TestProviders>,
  );
};

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders password fields and Reset button when a token is present', () => {
    const { container } = renderWithToken();
    // MUI TextField wraps the label in a notched <fieldset>; getByLabelText
    // resolves to the rendered <input>. Using querySelector avoids the MUI
    // label-association quirks that can surface under JSDOM.
    expect(container.querySelectorAll('input[type="password"]')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /reset password/i })).toBeInTheDocument();
  });

  it('shows a warning and disables the button when no token in URL', () => {
    renderWithToken(null);
    expect(screen.getByText(/no reset token in url/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reset password/i })).toBeDisabled();
  });

  it('rejects short passwords client-side without calling the service', async () => {
    renderWithToken();
    const [newPw, confirmPw] = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'));
    fireEvent.change(newPw, { target: { value: 'short' } });
    fireEvent.change(confirmPw, { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/at least 8 characters/i)).toBeInTheDocument();
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it('rejects mismatched passwords without calling the service', async () => {
    renderWithToken();
    const [newPw, confirmPw] = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'));
    fireEvent.change(newPw, { target: { value: 'LongEnough1' } });
    fireEvent.change(confirmPw, { target: { value: 'Different1' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/passwords do not match/i)).toBeInTheDocument();
    expect(authService.resetPassword).not.toHaveBeenCalled();
  });

  it('calls resetPassword on valid submit and shows success', async () => {
    authService.resetPassword.mockResolvedValue({ message: 'ok' });
    renderWithToken('my-token');
    const [newPw, confirmPw] = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'));
    fireEvent.change(newPw, { target: { value: 'Str0ngP@ss' } });
    fireEvent.change(confirmPw, { target: { value: 'Str0ngP@ss' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    await waitFor(() =>
      expect(authService.resetPassword).toHaveBeenCalledWith('my-token', 'Str0ngP@ss'),
    );
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
  });

  it('shows backend error message when resetPassword rejects', async () => {
    authService.resetPassword.mockRejectedValue({
      response: { data: { message: 'Invalid or already-used reset token' } },
    });
    renderWithToken('expired');
    const [newPw, confirmPw] = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'));
    fireEvent.change(newPw, { target: { value: 'Str0ngP@ss' } });
    fireEvent.change(confirmPw, { target: { value: 'Str0ngP@ss' } });
    fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

    expect(await screen.findByText(/invalid or already-used/i)).toBeInTheDocument();
  });
});
