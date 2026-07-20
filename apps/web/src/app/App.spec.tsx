import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App.js';
import { useSessionStore } from '../features/auth/session.js';

afterEach(() => {
  cleanup();
  useSessionStore.getState().clearSession();
  window.history.replaceState({}, '', '/');
});
describe('application shell', () => {
  it('redirects unauthenticated dashboard requests to login and renders the main skip target', async () => {
    useSessionStore.getState().clearSession();
    window.history.replaceState({}, '', '/dashboard');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Tiếp tục điều tra' }, { timeout: 10_000 })
    ).toBeInTheDocument();
    expect(screen.getByRole('form', { name: 'Đăng nhập' })).toBeInTheDocument();
    expect(screen.getByText('Bỏ qua điều hướng')).toHaveAttribute('href', '#main-content');
    expect(document.querySelector('main')).toHaveAttribute('id', 'main-content');
  });
  it('renders authenticated dashboard and useful 404', async () => {
    useSessionStore.getState().setSession({
      accessToken: 'access',
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'student@example.test',
        displayName: 'Sinh viên',
        role: 'student'
      }
    });
    window.history.replaceState({}, '', '/dashboard');
    const { unmount } = render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Bàn làm việc điều tra' })
    ).toBeInTheDocument();
    expect(screen.getByText(/Chào Sinh viên/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'QUÉT TÀI LIỆU MỚI' })).toHaveAttribute(
      'href',
      '/scanner/new'
    );
    unmount();
    useSessionStore.getState().clearSession();
    window.history.replaceState({}, '', '/missing');
    render(<App />);
    expect(
      await screen.findByRole('heading', { name: 'Không tìm thấy trang' })
    ).toBeInTheDocument();
  });
});
