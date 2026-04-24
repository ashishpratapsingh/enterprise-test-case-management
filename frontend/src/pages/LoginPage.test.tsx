import React from 'react';
import { render, screen } from '@testing-library/react';
import { TestProviders } from '../test-utils/providers';

jest.mock('../services/authService', () => ({
  __esModule: true,
  default: {
    login: jest.fn(),
    isAuthenticated: () => false,
    getStoredUser: () => null,
    getStoredToken: () => null,
    getCurrentUser: jest.fn().mockResolvedValue(null),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const LoginPage = require('./LoginPage').default;

describe('LoginPage', () => {
  it('renders email + password inputs and sign-in button', () => {
    render(
      <TestProviders user={null}>
        <LoginPage />
      </TestProviders>,
    );
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('shows the Forgot password link pointing to /forgot-password', () => {
    render(
      <TestProviders user={null}>
        <LoginPage />
      </TestProviders>,
    );
    const link = screen.getByRole('link', { name: /forgot password/i });
    expect(link).toHaveAttribute('href', '/forgot-password');
  });
});
