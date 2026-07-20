import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { useSessionStore } from '../auth/session.js';
import { DashboardPage } from './DashboardPage.js';

afterEach(() => {
  cleanup();
  useSessionStore.getState().clearSession();
});

describe('DashboardPage', () => {
  it('keeps the final mobile override to a single-column dashboard layout', () => {
    const dashboardCss = readFileSync(
      resolve(process.cwd(), 'src/features/dashboard/DashboardPage.css'),
      'utf8'
    );
    const finalMobileOverride = dashboardCss
      .slice(dashboardCss.lastIndexOf('@media (max-width: 760px)'))
      .replace(/\s+/g, '');

    expect(finalMobileOverride).toContain(
      '.dashboard-page__layout{grid-template-columns:minmax(0,1fr);gap:1.25rem;}'
    );
  });

  it('orients a signed-in learner with an evidence-workspace heading and the primary Scanner action', () => {
    useSessionStore.getState().setSession({
      accessToken: 'test-access-token',
      user: {
        id: 'learner-01',
        displayName: 'Minh An',
        email: 'minh@example.test',
        role: 'student'
      }
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Bàn làm việc điều tra' })).toBeInTheDocument();
    expect(screen.getByText(/Chào Minh An/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'QUÉT TÀI LIỆU MỚI' })).toHaveAttribute(
      'href',
      '/scanner/new'
    );
    expect(screen.getByText(/Bắt đầu với một dữ kiện có nguồn/i)).toBeInTheDocument();
  });

  it('shows three purposeful next actions and an honest first-use empty state', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'Scanner' })).toHaveAttribute('href', '/scanner');
    expect(screen.getByRole('link', { name: 'Copilot RAG' })).toHaveAttribute('href', '/copilot');
    expect(screen.getByRole('link', { name: 'Capital Arena' })).toHaveAttribute('href', '/arena');
    expect(screen.getByRole('heading', { name: 'Hoạt động gần đây' })).toBeInTheDocument();
    expect(screen.getByText(/Không bịa tiến độ cá nhân/i)).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Hàng chờ xử lý' })).toBeInTheDocument();
  });

  it('uses the Screen 04 evidence hierarchy without inventing learner activity', () => {
    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByText('EVIDENCE ACTIVE / Step 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Bàn làm việc điều tra' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'QUÉT TÀI LIỆU MỚI' })).toHaveAttribute(
      'href',
      '/scanner/new'
    );
    expect(screen.getByRole('heading', { name: 'Hoạt động gần đây' })).toBeInTheDocument();
    expect(screen.getByText(/Chưa có hoạt động được ghi nhận/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Khởi tạo luận án đầu tiên' })).toBeInTheDocument();
  });
});
