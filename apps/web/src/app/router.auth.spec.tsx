import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '../features/auth/session.js';
import { AppRouter } from './router.js';

vi.mock('../features/auth/LoginPage.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../features/auth/LoginPage.js')>();
  const { useLocation } = await import('react-router');

  return {
    ...actual,
    LoginPage: () => {
      const location = useLocation();

      return (
        <section>
          <actual.LoginPage />
          <output data-testid="login-location-state">{JSON.stringify(location.state)}</output>
        </section>
      );
    }
  };
});

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

describe('AppRouter protected routes for guests', () => {
  it.each(['/dashboard', '/scanner', '/copilot', '/arena', '/chat'])(
    'redirects a guest from %s to Login with the return path in router state',
    async (destination) => {
      useSessionStore.getState().clearSession();
      window.history.replaceState({}, '', destination);

      render(<AppRouter />);

      expect(await screen.findByRole('heading', { name: 'Tiếp tục điều tra' })).toBeInTheDocument();
      expect(screen.getByTestId('login-location-state')).toHaveTextContent(
        JSON.stringify({ from: destination })
      );
    }
  );
});
