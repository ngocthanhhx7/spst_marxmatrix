import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '../features/auth/session.js';
import { AppRouter } from './router.js';

afterEach(() => {
  cleanup();
  useSessionStore.getState().clearSession();
  window.history.replaceState({}, '', '/');
});

describe('AppRouter guest-only routes', () => {
  it.each(['/login', '/register'])('redirects an authenticated user away from %s', async (path) => {
    useSessionStore.getState().setSession({
      accessToken: 'access-token',
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'student@example.test',
        displayName: 'Student',
        role: 'student'
      }
    });
    window.history.replaceState({}, '', path);

    render(<AppRouter />);

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
  });

  it('redirects an authenticated token even when the user profile is not restored yet', async () => {
    useSessionStore.setState({
      status: 'authenticated',
      accessToken: 'access-token',
      user: undefined
    });
    window.history.replaceState({}, '', '/register');

    render(<AppRouter />);

    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
  });
});
