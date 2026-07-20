import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdminDocumentsPage } from './AdminDocumentsPage.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../shared/api/runtime.js', () => ({ apiClient: { request } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const document = {
  id: '507f1f77bcf86cd799439011',
  title: 'MLN112: Hàng hóa',
  status: 'failed',
  pageCount: 26,
  errorMessage: 'Lập chỉ mục chưa hoàn tất.',
  updatedAt: '2026-07-19T00:00:00.000Z'
};

function renderPage() {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AdminDocumentsPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('AdminDocumentsPage', () => {
  it('lists ingestion status and requeues a failed index job through the API', async () => {
    request.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/admin/documents') return Promise.resolve([document]);
      if (path === `/admin/documents/${document.id}/reindex` && init?.method === 'POST')
        return Promise.resolve({ status: 'queued' });
      return Promise.resolve([]);
    });
    renderPage();

    expect(await screen.findByText('MLN112: Hàng hóa')).toBeInTheDocument();
    expect(screen.getByText(/Lập chỉ mục chưa hoàn tất/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lập chỉ mục lại' }));

    expect(await screen.findByText(/Đã xếp hàng lập chỉ mục/i)).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(`/admin/documents/${document.id}/reindex`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ courseId: 'MLN112' })
    });
  });

  it('states when admin ingestion is unavailable and exposes a real refresh action', async () => {
    request.mockRejectedValue(new Error('offline'));
    renderPage();

    expect(await screen.findByText(/Chưa thể tải danh sách học liệu/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại' }));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('polls only while an ingestion job is still in progress', async () => {
    vi.useFakeTimers();
    request.mockResolvedValue([
      { ...document, status: 'embedding', errorMessage: null, failedJobId: null }
    ]);
    renderPage();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('MLN112: Hàng hóa')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(request).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('frames document jobs as an operational evidence ledger', async () => {
    request.mockResolvedValue([document]);
    renderPage();
    expect(await screen.findByRole('heading', { name: /Operations ledger/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Upload control/i })).toBeInTheDocument();
  });

  it('exposes the Screen 16 operations frame without inventing unsupported destructive actions', async () => {
    request.mockResolvedValue([document]);
    renderPage();
    expect(
      await screen.findByRole('navigation', { name: /Operations navigation/i })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'JOB DOSSIER' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Emergency stop|Cancel job/i })
    ).not.toBeInTheDocument();
  });
});
