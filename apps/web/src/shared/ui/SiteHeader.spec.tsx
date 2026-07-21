import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { useSessionStore } from '../../features/auth/session.js';
import { SiteHeader } from './SiteHeader.js';

const productLinks = [
  ['Bảng điều khiển', '/dashboard'],
  ['Scanner', '/scanner'],
  ['Copilot', '/copilot'],
  ['Capital Arena', '/arena'],
  ['AI Chat', '/chat']
] as const;

afterEach(() => {
  cleanup();
  useSessionStore.getState().clearSession();
});

describe('SiteHeader', () => {
  it('renders the shared product links for guests in desktop and mobile navigation', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <SiteHeader />
      </MemoryRouter>
    );

    for (const navigationName of ['Điều hướng sản phẩm', 'Điều hướng di động']) {
      const navigation = within(screen.getByRole('navigation', { name: navigationName }));

      expect(
        navigation.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')])
      ).toEqual(productLinks);
    }

    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Đăng ký' })).toHaveAttribute('href', '/register');
  });

  it('keeps the scanner selected for nested routes in both product navigations', () => {
    render(
      <MemoryRouter initialEntries={['/scanner/history']}>
        <SiteHeader />
      </MemoryRouter>
    );

    for (const navigationName of ['Điều hướng sản phẩm', 'Điều hướng di động']) {
      expect(
        within(screen.getByRole('navigation', { name: navigationName })).getByRole('link', {
          name: 'Scanner'
        })
      ).toHaveAttribute('aria-current', 'page');
    }

    expect(screen.getByRole('link', { name: 'MarxMatrix' })).toHaveAttribute('href', '/');
  });

  it('renders signed-in workspace actions and the admin learning-material link', () => {
    useSessionStore.getState().setSession({
      accessToken: 'token',
      user: {
        id: '507f1f77bcf86cd799439011',
        email: 'admin@example.test',
        displayName: 'Admin',
        role: 'admin'
      }
    });
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <SiteHeader />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Tư liệu' })).toHaveAttribute('href', '/#method');
    expect(screen.getByLabelText('Hệ thống sẵn sàng')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Admin' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Học liệu' })).toHaveAttribute(
      'href',
      '/admin/documents'
    );
    expect(screen.queryByRole('link', { name: 'Đăng nhập' })).not.toBeInTheDocument();
  });
});
