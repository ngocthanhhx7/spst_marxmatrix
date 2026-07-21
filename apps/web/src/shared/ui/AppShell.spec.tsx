import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '../../features/auth/session.js';
import { AppShell } from './AppShell.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSessionStore.getState().clearSession();
});

describe('AppShell', () => {
  it('wins the mobile cascade so only the dedicated bottom navigation remains visible', () => {
    const globalCss = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8');
    const compactShellStyles = globalCss
      .slice(globalCss.lastIndexOf('/* Compact authenticated workspace shell. */'))
      .replace(/\s+/g, ' ');

    expect(compactShellStyles).toContain(
      '.site-header .app-navigation { display: none !important; }'
    );
  });

  it('does not duplicate application chrome on public authentication routes', () => {
    render(
      <MemoryRouter initialEntries={['/login']}>
        <AppShell />
      </MemoryRouter>
    );

    expect(screen.queryByRole('navigation', { name: 'Tài khoản' })).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('keeps /about standalone while supplying the shared skip link and scroll restoration', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    render(
      <MemoryRouter initialEntries={['/about']}>
        <AppShell />
      </MemoryRouter>
    );

    expect(screen.getByText('Bỏ qua điều hướng')).toHaveAttribute('href', '#main-content');
    expect(document.querySelector('.site-header')).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });

  it('exposes every primary workspace and the current route to signed-in learners', () => {
    useSessionStore.getState().setSession({
      accessToken: 'token',
      user: {
        id: '507f1f77bcf86cd799439012',
        email: 'learner@example.test',
        displayName: 'Learner',
        role: 'student'
      }
    });
    render(
      <MemoryRouter initialEntries={['/scanner']}>
        <AppShell />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Scanner' })).toHaveAttribute('href', '/scanner');
    expect(screen.getByRole('navigation', { name: 'Primary workspace' })).toBeInTheDocument();
    expect(
      screen.getByRole('navigation', { name: 'Mobile primary workspace' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Copilot' })).toHaveAttribute('href', '/copilot');
    expect(screen.getByRole('link', { name: 'AI Chat' })).toHaveAttribute('href', '/chat');
    expect(screen.getByRole('link', { name: 'Capital Arena' })).toHaveAttribute('href', '/arena');
    expect(screen.getByRole('link', { name: 'Scanner' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: /Admin/i })).not.toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('offers Copilot to signed-in learners and the ingestion area to admins', () => {
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
        <AppShell />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Copilot' })).toHaveAttribute('href', '/copilot');
    expect(screen.getByRole('link', { name: 'Học liệu' })).toHaveAttribute(
      'href',
      '/admin/documents'
    );
  });

  it('resets the viewport when workspace navigation changes route', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    useSessionStore.getState().setSession({
      accessToken: 'token',
      user: {
        id: '507f1f77bcf86cd799439012',
        email: 'learner@example.test',
        displayName: 'Learner',
        role: 'student'
      }
    });
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AppShell />
      </MemoryRouter>
    );

    expect(scrollTo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('link', { name: 'Scanner' }));
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });
});
