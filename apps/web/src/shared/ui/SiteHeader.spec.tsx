import { cleanup, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  it('uses direct-child specificity to hide long account details at compact widths', () => {
    const globalCss = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8').replace(
      /\s+/g,
      ' '
    );

    expect(globalCss).toContain(
      '.app-header-actions > .app-header-actions__evidence, .app-header-actions > .app-header-actions__status, .app-header-actions > .app-header-actions__account { display: none; }'
    );
    expect(globalCss).toContain(
      '.app-header-actions > .app-header-actions__admin { display: none; }'
    );
    expect(globalCss).toContain(
      '.app-header-actions > .app-header-actions__admin { display: inline-flex; }'
    );
  });

  it('keeps guest and account actions in one compact row with accessible target heights', () => {
    const globalCss = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8').replace(
      /\s+/g,
      ' '
    );

    expect(globalCss).toContain('.site-header > .account-navigation { grid-column: auto; }');
    expect(globalCss).toContain(
      '.account-navigation > a, .app-header-actions > a { display: inline-flex; align-items: center; min-height: 2.75rem; }'
    );
    expect(globalCss).toContain(
      '@media (max-width: 24rem) { .site-header { gap: var(--space-2); } .site-header .brand-mark span { display: none; }'
    );
    expect(globalCss).toContain(
      '@media (max-width: 69.99rem) { .site-header { grid-template-columns: 1fr auto; min-height: 3.5rem; padding: 0 var(--space-4); } .site-header .app-navigation { display: none !important; }'
    );
  });

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
    expect(
      within(screen.getByRole('navigation', { name: 'Điều hướng sản phẩm' })).getByRole('link', {
        name: 'Học liệu'
      })
    ).toHaveAttribute('href', '/admin/documents');
    expect(
      within(document.querySelector('.app-header-actions') as HTMLElement).getByRole('link', {
        name: 'Học liệu'
      })
    ).toHaveAttribute('href', '/admin/documents');
    expect(
      within(screen.getByRole('navigation', { name: 'Điều hướng di động' }))
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')])
    ).toEqual(productLinks);
    expect(screen.queryByRole('link', { name: 'Đăng nhập' })).not.toBeInTheDocument();
  });
});
