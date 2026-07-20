import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { useSessionStore } from '../auth/session.js';
import { LandingPage } from './LandingPage.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useSessionStore.getState().clearSession();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

describe('LandingPage', () => {
  it('renders the Figma public header and real product routes', () => {
    renderPage();

    const header = screen.getByRole('banner');
    expect(within(header).getByText('MarxMatrix')).toBeInTheDocument();
    expect(within(header).getByRole('link', { name: 'Login' })).toHaveAttribute('href', '/login');
    expect(within(header).getByRole('link', { name: /Bắt đầu phân tích/i })).toHaveAttribute(
      'href',
      '/scanner/new'
    );
    expect(within(header).getByRole('link', { name: 'Phương pháp' })).toHaveAttribute(
      'href',
      '#method'
    );
    expect(within(header).getByRole('link', { name: 'Công cụ' })).toHaveAttribute('href', '#tools');
    expect(within(header).getByRole('link', { name: 'Capital Arena' })).toHaveAttribute(
      'href',
      '/arena'
    );
  });

  it('replaces public account actions with the authenticated user and workspace route', () => {
    useSessionStore.getState().setSession({
      accessToken: 'test-access-token',
      user: {
        id: 'learner-01',
        displayName: 'Nguyễn An',
        email: 'an@example.test',
        role: 'student'
      }
    });

    renderPage();

    const header = screen.getByRole('banner');
    expect(within(header).queryByRole('link', { name: 'Login' })).not.toBeInTheDocument();
    expect(within(header).getByRole('link', { name: 'Nguyễn An' })).toHaveAttribute(
      'href',
      '/settings'
    );
    expect(within(header).getByRole('link', { name: /Vào workspace/i })).toHaveAttribute(
      'href',
      '/dashboard'
    );
  });

  it('matches the Figma hero and system-status specimen', () => {
    renderPage();

    expect(screen.getByText('MARXMATRIX / EDITORIAL SYSTEMS / 2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Scanner evidence specimen')).toBeInTheDocument();
    expect(screen.getByLabelText('Copilot citation specimen')).toBeInTheDocument();
    expect(screen.getByLabelText('Arena round specimen')).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Nội soi tư bản công nghệ.' })).toBeInTheDocument();
    expect(screen.getByText('[System_status]')).toBeInTheDocument();
    expect(screen.getByText('Active_scanning')).toBeInTheDocument();
    expect(screen.getByText('1.84')).toBeInTheDocument();
    expect(screen.getByText('72.4k')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Quét tài liệu/i })).toHaveAttribute(
      'href',
      '/scanner/new'
    );
  });

  it('renders the full-width analysis dossier as an accessible evidence table', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Cloud Platform / 2025' })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(
      within(table).getByRole('columnheader', { name: 'Thực thể phân tích' })
    ).toBeInTheDocument();
    expect(within(table).getByText('Cơ sở hạ tầng GPU')).toBeInTheDocument();
    expect(within(table).getByText('Mạng lưới phân phối')).toBeInTheDocument();
    expect(within(table).getByText('Đã xác minh')).toBeInTheDocument();
    expect(within(table).getByText('Cần đối chiếu')).toBeInTheDocument();
  });

  it('contains the three Figma tools, four evidence steps and security section', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /Công cụ Trích xuất/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Copilot RAG/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Capital Arena' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Quy trình tổng hợp bằng chứng' })
    ).toBeInTheDocument();
    for (const label of ['Nguồn', 'Trích xuất', 'Đối chiếu', 'Luận giải'])
      expect(screen.getByText(label)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Bảo mật & Quyền kiểm soát tuyệt đối/i })
    ).toBeInTheDocument();
  });

  it('moves focus when an in-page navigation link is activated', () => {
    renderPage();
    const target = screen
      .getByRole('heading', { name: 'Quy trình tổng hợp bằng chứng' })
      .closest('section');
    expect(target).not.toBeNull();

    fireEvent.click(screen.getByRole('link', { name: 'Phương pháp' }));
    expect(target).toHaveFocus();
  });

  it('keeps the compact archival layout and mobile interaction contract in CSS', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/features/landing/LandingPage.css'),
      'utf8'
    );

    expect(css).toContain('min-height: 44px');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('grid-template-columns: repeat(12, minmax(0, 1fr))');
  });

  it('renders the Figma footer navigation and system provenance', () => {
    renderPage();
    const footer = screen.getByRole('contentinfo');

    expect(within(footer).getByRole('navigation', { name: 'Product' })).toBeInTheDocument();
    expect(within(footer).getByRole('navigation', { name: 'Resources' })).toBeInTheDocument();
    expect(within(footer).getByRole('navigation', { name: 'Legal' })).toBeInTheDocument();
    expect(within(footer).getByRole('navigation', { name: 'Method' })).toBeInTheDocument();
    expect(within(footer).getByRole('navigation', { name: 'System' })).toBeInTheDocument();
    expect(within(footer).getByText(/System_stable_v2.04/i)).toBeInTheDocument();
  });
});
