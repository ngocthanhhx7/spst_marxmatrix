import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DocumentExtractionPage } from './DocumentExtractionPage.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../shared/api/runtime.js', () => ({ apiClient: { request } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const document = {
  id: '507f1f77bcf86cd799439011',
  title: 'Báo cáo thường niên 2025',
  type: 'financial_report',
  status: 'ready',
  mimeType: 'application/pdf',
  originalFileName: 'annual-report.pdf',
  byteSize: 1200,
  checksum: 'a'.repeat(64),
  pageCount: 1,
  errorCode: null,
  errorMessage: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z'
};

function renderPage() {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <DocumentExtractionPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('DocumentExtractionPage', () => {
  it('uses the Screen 08 evidence-extraction hierarchy with a disabled review path before readiness', async () => {
    request.mockResolvedValue([]);
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Trích xuất bằng chứng từ tài liệu' })
    ).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: /Pipeline trích xuất/i })).toBeInTheDocument();
  });
  it('keeps queued candidates pending review and hands the learner to the selected analysis', async () => {
    request.mockImplementation((path: string, options?: { method?: string }) => {
      if (path === '/documents') return Promise.resolve([document]);
      if (path === '/analyses')
        return Promise.resolve([{ id: 'analysis-08', title: 'Cloud Platform 2025' }]);
      if (path === `/documents/${document.id}/extractions` && options?.method === 'POST')
        return Promise.resolve({
          status: 'queued',
          documentId: document.id,
          analysisId: 'analysis-08'
        });
      if (path === `/documents/${document.id}/extractions`)
        return Promise.resolve({
          facts: [],
          simulated: false,
          model: 'gemini',
          promptVersion: 'v1',
          usage: null
        });
      return Promise.resolve([]);
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Báo cáo thường niên 2025/i }));
    await screen.findByRole('option', { name: 'Cloud Platform 2025' });
    fireEvent.change(await screen.findByLabelText('Phân tích đích'), {
      target: { value: 'analysis-08' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu trích xuất AI' }));

    expect(await screen.findByText(/Đã xếp hàng trích xuất; AI chỉ đề xuất/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở hàng chờ duyệt' })).toHaveAttribute(
      'href',
      '/scanner/analysis-08?focus=pending'
    );
    expect(screen.getByRole('complementary', { name: 'Pipeline trích xuất' })).toBeInTheDocument();
  });

  it('shows a pending-review extracted fact with its page evidence', async () => {
    request.mockImplementation((path: string) => {
      if (path === '/documents') return Promise.resolve([document]);
      if (path === `/documents/${document.id}/extractions`)
        return Promise.resolve([
          {
            id: '507f1f77bcf86cd799439012',
            label: 'Doanh thu thuần',
            value: 1250,
            currency: 'USD',
            scale: 'millions',
            reportingPeriod: 'FY2025',
            classification: 'revenue',
            reviewStatus: 'pending_review',
            sourcePage: 42,
            evidenceText: 'Net revenue was $1,250 million.'
          }
        ]);
      return Promise.resolve([]);
    });

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Báo cáo thường niên 2025/i }));

    expect(await screen.findByText('Doanh thu thuần')).toBeInTheDocument();
    expect(screen.getByText('Chờ duyệt', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/Trang 42/i)).toBeInTheDocument();
    expect(screen.getByText(/Net revenue was/)).toBeInTheDocument();
    expect(request).toHaveBeenCalledWith(`/documents/${document.id}/extractions`);
  });

  it('loads extracted facts while a parsed document awaits later indexing', async () => {
    const parsedDocument = { ...document, status: 'parsed' };
    request.mockImplementation((path: string) => {
      if (path === '/documents') return Promise.resolve([parsedDocument]);
      if (path.endsWith('/extractions'))
        return Promise.resolve([
          {
            id: '507f1f77bcf86cd799439012',
            label: 'Chi phí nhân công',
            value: 200,
            currency: 'USD',
            scale: 'millions',
            reportingPeriod: 'FY2025',
            classification: 'variable_capital',
            reviewStatus: 'pending_review',
            sourcePage: 8,
            evidenceText: 'Labour costs totalled $200 million.'
          }
        ]);
      return Promise.resolve([]);
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Báo cáo thường niên 2025/i }));

    expect(await screen.findByText('Chi phí nhân công')).toBeInTheDocument();
  });

  it('renders an unavailable state and lets the user retry extraction loading', async () => {
    request.mockImplementation((path: string) => {
      if (path === '/documents') return Promise.resolve([document]);
      if (path.endsWith('/extractions')) return Promise.reject(new Error('offline'));
      return Promise.resolve([]);
    });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Báo cáo thường niên 2025/i }));

    expect(await screen.findByText(/Chưa thể lấy kết quả trích xuất/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(
      request.mock.calls.filter(([path]) => String(path).endsWith('/extractions'))
    ).toHaveLength(2);
  });

  it('validates the PDF upload fields before making a request', async () => {
    request.mockResolvedValueOnce([]);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Tải PDF lên/i }));

    expect(screen.getByRole('alert')).toHaveTextContent(/Nhập tiêu đề/i);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('uploads a financial report PDF as multipart data and shows success', async () => {
    request.mockImplementation((path: string, options?: { method?: string; body?: FormData }) => {
      if (path === '/documents' && options?.method === 'POST') return Promise.resolve(document);
      return Promise.resolve([]);
    });
    renderPage();
    const file = new File(['%PDF-1.4'], 'annual-report.pdf', { type: 'application/pdf' });
    fireEvent.change(await screen.findByLabelText('Tiêu đề tài liệu'), {
      target: { value: 'Báo cáo thường niên 2025' }
    });
    fireEvent.change(screen.getByLabelText('Chọn tệp PDF'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /Tải PDF lên/i }));

    expect(await screen.findByText(/Đã tải PDF lên/i)).toBeInTheDocument();
    const calls = request.mock.calls as unknown as Array<
      [string, { method?: string; body?: FormData }]
    >;
    const [, options] = calls.find(
      ([path, init]) => path === '/documents' && init?.method === 'POST'
    )!;
    expect(options.body).toBeInstanceOf(FormData);
    const formData = options.body!;
    expect(formData.get('title')).toBe('Báo cáo thường niên 2025');
    expect(formData.get('type')).toBe('financial_report');
    expect(formData.get('file')).toBe(file);
  });
});
