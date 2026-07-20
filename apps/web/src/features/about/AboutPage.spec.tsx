import { cleanup, render, screen, within } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from '../../app/App.js';
import { useSessionStore } from '../auth/session.js';

afterEach(() => {
  cleanup();
  useSessionStore.getState().clearSession();
  window.history.replaceState({}, '', '/');
});

describe('AboutPage', () => {
  it('renders the public evidence dossier at /about with real product links', async () => {
    window.history.replaceState({}, '', '/about');
    render(<App />);

    expect(
      await screen.findByRole(
        'heading',
        { name: /evidence before conclusions/i },
        { timeout: 10_000 }
      )
    ).toBeInTheDocument();
    const header = screen.getByRole('banner');
    expect(within(header).getByRole('link', { name: /about/i })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(within(header).getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: /open scanner/i })).toHaveAttribute(
      'href',
      '/scanner/new'
    );
    expect(screen.getByRole('link', { name: /open copilot/i })).toHaveAttribute('href', '/copilot');
    expect(screen.getByRole('link', { name: /enter capital arena/i })).toHaveAttribute(
      'href',
      '/arena'
    );
  }, 15_000);

  it('shows the signed-in account actions and the exact project team', async () => {
    useSessionStore.getState().setSession({
      accessToken: 'test-access-token',
      user: {
        id: 'learner-01',
        displayName: 'Nguyễn An',
        email: 'an@example.test',
        role: 'student'
      }
    });
    window.history.replaceState({}, '', '/about');
    render(<App />);

    const header = await screen.findByRole('banner');
    expect(within(header).getByRole('link', { name: 'Nguyễn An' })).toHaveAttribute(
      'href',
      '/settings'
    );
    expect(within(header).getByRole('link', { name: /workspace/i })).toHaveAttribute(
      'href',
      '/dashboard'
    );
    expect(screen.getByText('Nguyễn Ngọc Thành HE186491')).toBeInTheDocument();
    for (const member of [
      'Vương Giang Trường HE186135',
      'Vũ Kim Kỳ HE182094',
      'Dương Tuấn Anh HE180437',
      'Nguyễn Xuân Dương HE190405',
      'Trần Đức Minh HE190690',
      'Phạm Hải Trung HE190486',
      'Nguyễn Khắc Tráng HE186034',
      'other collaborators'
    ])
      expect(screen.getByText(member)).toBeInTheDocument();
  }, 15_000);

  it('keeps the desktop grid, accessible touch targets, mobile layout and motion fallback in CSS', () => {
    const path = resolve(process.cwd(), 'src/features/about/AboutPage.css');
    const css = existsSync(path) ? readFileSync(path, 'utf8') : '';

    expect(css).toContain('grid-template-columns: repeat(12, minmax(0, 1fr))');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('@media (max-width: 48rem)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });
});
