import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { ProtectedRoute } from './ProtectedRoute.js';
import { useSessionStore } from './session.js';

afterEach(() => useSessionStore.getState().clearSession());
describe('protected route restoration state', () => {
  it('shows loading while restoration is unknown', () => {
    useSessionStore.setState({ status: 'unknown', accessToken: undefined, user: undefined });
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<p>Dashboard</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Đang kiểm tra phiên đăng nhập…')).toBeInTheDocument();
  });
  it('renders the direct dashboard after a restored session', () => {
    useSessionStore.getState().setSession({
      accessToken: 'access',
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'student@example.test',
        displayName: 'Sinh viên',
        role: 'student'
      }
    });
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<p>Dashboard</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });
});
