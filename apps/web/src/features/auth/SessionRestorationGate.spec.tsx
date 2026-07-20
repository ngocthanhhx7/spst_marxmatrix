import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router';
import { useSessionStore } from './session.js';
import { SessionRestorationGate } from './SessionRestorationGate.js';

afterEach(() => {
  useSessionStore.getState().clearSession();
});

describe('SessionRestorationGate', () => {
  it('keeps a direct registration route hidden until session restoration resolves', () => {
    useSessionStore.setState({ status: 'unknown', accessToken: undefined, user: undefined });

    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route element={<SessionRestorationGate />}>
            <Route element={<Outlet />}>
              <Route path="/register" element={<p>Registration form</p>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Đang kiểm tra phiên đăng nhập…')).toBeInTheDocument();
    expect(screen.queryByText('Registration form')).not.toBeInTheDocument();

    act(() => useSessionStore.getState().clearSession());

    expect(screen.getByText('Registration form')).toBeInTheDocument();
  });
});
