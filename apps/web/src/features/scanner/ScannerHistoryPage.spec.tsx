import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScannerHistoryPage } from './ScannerHistoryPage.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../shared/api/runtime.js', () => ({ apiClient: { request } }));

afterEach(() => cleanup());

describe('ScannerHistoryPage', () => {
  it('uses the Screen 05 ledger hierarchy and preserves an honest empty state', async () => {
    request.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <ScannerHistoryPage />
        </QueryClientProvider>
      </MemoryRouter>
    );
    expect(await screen.findByRole('heading', { name: 'Hồ sơ phân tích' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'PHÂN TÍCH THỦ CÔNG' })).toHaveAttribute(
      'href',
      '/scanner/new'
    );
    expect(await screen.findByText(/Chưa có phân tích nào/i)).toBeInTheDocument();
  });
  it('opens a saved analysis through its protected detail route', async () => {
    request.mockResolvedValueOnce([
      {
        id: '507f1f77bcf86cd799439011',
        title: 'Cloud Platform 2025',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-02T00:00:00.000Z'
      }
    ]);
    render(
      <MemoryRouter initialEntries={['/scanner']}>
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <Routes>
            <Route path="/scanner" element={<ScannerHistoryPage />} />
            <Route path="/scanner/:analysisId" element={<h1>Chi tiết phân tích đã lưu</h1>} />
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    );
    expect(await screen.findByRole('link', { name: 'Cloud Platform 2025' })).toHaveAttribute(
      'href',
      '/scanner/507f1f77bcf86cd799439011'
    );
    expect(
      screen.getByRole('navigation', { name: 'Create or import an analysis source' })
    ).toBeInTheDocument();
    expect(screen.getByText('05 / SỔ PHÂN TÍCH')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hồ sơ phân tích' })).toBeInTheDocument();
    expect(screen.getByText('CẬP NHẬT')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /PHÂN TÍCH THỦ CÔNG/i })).toHaveAttribute(
      'href',
      '/scanner/new'
    );
    expect(screen.getByRole('link', { name: /Xem trích xuất AI từ PDF/i })).toHaveAttribute(
      'href',
      '/scanner/extract'
    );
    fireEvent.click(screen.getByRole('link', { name: 'Cloud Platform 2025' }));
    expect(
      await screen.findByRole('heading', { name: 'Chi tiết phân tích đã lưu' })
    ).toBeInTheDocument();
  });
});
