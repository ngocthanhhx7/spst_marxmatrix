import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRouter } from './router.js';
import { useSessionStore } from '../features/auth/session.js';

vi.mock('../shared/ui/AppShell.js', async () => {
  const { Outlet } = await import('react-router');
  return { AppShell: () => <Outlet /> };
});
vi.mock('../features/auth/ProtectedRoute.js', async () => {
  const { Outlet } = await import('react-router');
  return { ProtectedRoute: () => <Outlet /> };
});
vi.mock('../features/auth/AdminRoute.js', async () => {
  const { Outlet } = await import('react-router');
  return { AdminRoute: () => <Outlet /> };
});
vi.mock('../features/arena/ArenaGamePage.js', () => ({
  ArenaGamePage: () => <h1>Live arena route</h1>
}));
vi.mock('../features/arena/ArenaResultsPage.js', () => ({
  ArenaResultsPage: () => <h1>Arena results route</h1>
}));
vi.mock('../features/arena/ArenaReplayPage.js', () => ({
  ArenaReplayPage: () => <h1>Arena replay route</h1>
}));

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/');
});

describe('AppRouter Arena routes', () => {
  it.each([
    ['/arena/games/507f1f77bcf86cd799439011', 'Live arena route'],
    ['/arena/games/507f1f77bcf86cd799439011/results', 'Arena results route'],
    ['/arena/games/507f1f77bcf86cd799439011/replay', 'Arena replay route']
  ])('renders %s inside the protected application shell', async (path, heading) => {
    useSessionStore.getState().clearSession();
    window.history.replaceState({}, '', path);
    render(<AppRouter />);
    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
  });
});
