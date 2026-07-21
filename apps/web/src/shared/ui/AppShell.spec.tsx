import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSessionStore } from '../../features/auth/session.js';
import { AppShell } from './AppShell.js';

const productNavigationLabel = '\u0110i\u1ec1u h\u01b0\u1edbng s\u1ea3n ph\u1ea9m';
const mobileNavigationLabel = '\u0110i\u1ec1u h\u01b0\u1edbng di \u0111\u1ed9ng';

function renderShellRoute(path: string, outlet: ReactNode = <section>Page content</section>) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={outlet} />
          <Route path="/about" element={outlet} />
          <Route path="/dashboard" element={outlet} />
          <Route path="/login" element={outlet} />
          <Route path="/register" element={outlet} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

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

  it.each(['/', '/about', '/dashboard'])('renders one shared banner for %s', (path) => {
    renderShellRoute(path);

    expect(screen.getAllByRole('banner')).toHaveLength(1);
    expect(screen.getAllByRole('navigation', { name: productNavigationLabel })).toHaveLength(1);
    expect(screen.getAllByRole('navigation', { name: mobileNavigationLabel })).toHaveLength(1);
  });

  it.each(['/login', '/register'])('does not render the shared banner for %s', (path) => {
    renderShellRoute(path);

    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: productNavigationLabel })).not.toBeInTheDocument();
  });

  it.each([
    ['/', 'Home'],
    ['/about', 'About']
  ])('%s lets the %s outlet own the only main landmark', (path, pageName) => {
    renderShellRoute(path, <main aria-label={pageName}>Page content</main>);

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main', { name: pageName })).toBeInTheDocument();
  });

  it('wraps workspace outlets in the shell main landmark', () => {
    renderShellRoute('/dashboard');

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it.each([
    ['/', <footer>Landing footer</footer>],
    ['/about', <footer>About footer</footer>]
  ])('%s leaves the page-owned footer untouched', (path, outlet) => {
    renderShellRoute(path, outlet);

    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
  });

  it.each(['/login', '/register'])('%s stays standalone without a shell footer', (path) => {
    renderShellRoute(path);

    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('adds the shared footer to workspace routes', () => {
    renderShellRoute('/dashboard');

    expect(screen.getAllByRole('contentinfo')).toHaveLength(1);
  });

  it('preserves the shared skip link and scroll restoration', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    renderShellRoute('/about', <main aria-label="About">Page content</main>);

    expect(document.querySelector('.skip-link')).toHaveAttribute('href', '#main-content');
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });
});
