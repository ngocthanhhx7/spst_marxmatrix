import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router';
import { useSessionStore } from '../auth/session.js';
import { AppShell } from '../../shared/ui/AppShell.js';
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

const productNavigationLabel = 'Điều hướng sản phẩm';

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<LandingPage />} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe('LandingPage', () => {
  it('uses one shared banner with the complete five-link product navigation on routed Home', () => {
    renderHome();

    expect(screen.getAllByRole('banner')).toHaveLength(1);
    const header = screen.getByRole('banner');
    expect(within(header).getByText('MarxMatrix')).toBeInTheDocument();
    const productNavigation = within(header).getByRole('navigation', {
      name: productNavigationLabel
    });
    expect(within(productNavigation).getAllByRole('link')).toHaveLength(5);
    expect(within(productNavigation).getByRole('link', { name: 'Bảng điều khiển' })).toHaveAttribute(
      'href',
      '/dashboard'
    );
    expect(within(productNavigation).getByRole('link', { name: 'Scanner' })).toHaveAttribute('href', '/scanner');
    expect(within(productNavigation).getByRole('link', { name: 'Copilot' })).toHaveAttribute('href', '/copilot');
    expect(within(productNavigation).getByRole('link', { name: 'Capital Arena' })).toHaveAttribute('href', '/arena');
    expect(within(productNavigation).getByRole('link', { name: 'AI Chat' })).toHaveAttribute('href', '/chat');
  });

  it('does not create a banner when rendered directly', () => {
    renderPage();

    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
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
    const target = document.getElementById('method');
    expect(target).not.toBeNull();

    fireEvent.click(within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Documentation' }));
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

  it('reserves landing footer clearance for the shared mobile navigation', () => {
    const css = readFileSync(
      resolve(process.cwd(), 'src/features/landing/LandingPage.css'),
      'utf8'
    );

    expect(css).toContain('@media (max-width: 69.99rem) {');
    expect(css).toContain('padding-bottom: calc(3.5rem + env(safe-area-inset-bottom));');
  });

  it('renders the Figma footer navigation and system provenance', () => {
    renderPage();
    const footer = screen.getByRole('contentinfo');

    expect(within(footer).getByRole('navigation', { name: 'Product' })).toBeInTheDocument();
    expect(within(footer).getByRole('navigation', { name: 'Resources' })).toBeInTheDocument();
    expect(within(footer).getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
    expect(within(footer).getByRole('navigation', { name: 'Legal' })).toBeInTheDocument();
    expect(within(footer).getByRole('navigation', { name: 'Method' })).toBeInTheDocument();
    expect(within(footer).getByRole('navigation', { name: 'System' })).toBeInTheDocument();
    expect(within(footer).getByText(/System_stable_v2.04/i)).toBeInTheDocument();
  });
});
