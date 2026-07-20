import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
describe('session restoration', () => {
  it('deduplicates StrictMode refresh and restores a direct dashboard', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'access',
          user: {
            id: '507f1f77bcf86cd799439011',
            email: 'student@example.test',
            displayName: 'Sinh viên',
            role: 'student'
          }
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetcher);
    const { Providers } = await import('./providers.js');
    const { ProtectedRoute } = await import('../features/auth/ProtectedRoute.js');
    render(
      <StrictMode>
        <Providers>
          <MemoryRouter initialEntries={['/dashboard']}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<p>Dashboard</p>} />
              </Route>
            </Routes>
          </MemoryRouter>
        </Providers>
      </StrictMode>
    );
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('resolves failed restoration once and redirects to login', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 401 }));
    vi.stubGlobal('fetch', fetcher);
    const { Providers } = await import('./providers.js');
    const { ProtectedRoute } = await import('../features/auth/ProtectedRoute.js');
    render(
      <StrictMode>
        <Providers>
          <MemoryRouter initialEntries={['/dashboard']}>
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/dashboard" element={<p>Dashboard</p>} />
              </Route>
              <Route path="/login" element={<p>Login</p>} />
            </Routes>
          </MemoryRouter>
        </Providers>
      </StrictMode>
    );
    expect(await screen.findByText('Login')).toBeInTheDocument();
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  });
});
