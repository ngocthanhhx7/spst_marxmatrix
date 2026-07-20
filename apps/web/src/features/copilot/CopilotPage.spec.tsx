import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopilotPage } from './CopilotPage.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../shared/api/runtime.js', () => ({ apiClient: { request } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <CopilotPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('CopilotPage', () => {
  it('renders the three-column evidence workspace and selects a real source row', async () => {
    request.mockResolvedValue([
      { id: '507f1f77bcf86cd799439012', title: 'Giáo trình MLN112', pageCount: 80 }
    ]);
    renderPage();
    expect(screen.getByRole('region', { name: 'Nguồn tài liệu' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Copilot bằng chứng' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Kiểm chứng trích dẫn' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Tìm trong nguồn' })).toHaveAttribute(
      'name',
      'source-query'
    );
    const source = await screen.findByRole('checkbox', { name: /Giáo trình MLN112/i });
    fireEvent.click(source);
    expect(source).toBeChecked();
    expect(screen.getByText(/1 tài liệu đã chọn/i)).toBeInTheDocument();
  });

  it('renders only returned citations in the verification rail and opens their real source route', async () => {
    request.mockImplementation((path: string) =>
      path.startsWith('/rag/documents')
        ? Promise.resolve([
            { id: '507f1f77bcf86cd799439012', title: 'Giáo trình MLN112', pageCount: 80 }
          ])
        : Promise.resolve({
            mode: 'query',
            answer: 'Một phản hồi có căn cứ.',
            simulated: false,
            warning: null,
            claims: [{ text: 'Một luận điểm.', citationIndexes: [0] }],
            citations: [
              {
                chunkId: '507f1f77bcf86cd799439011',
                documentId: '507f1f77bcf86cd799439012',
                pageStart: 12,
                pageEnd: 12,
                quote: 'Đoạn trích đã được đối chiếu.'
              }
            ]
          })
    );
    renderPage();
    fireEvent.change(screen.getByLabelText('Câu hỏi cho Copilot'), {
      target: { value: 'Giải thích hàng hóa.' }
    });
    fireEvent.click(await screen.findByRole('checkbox', { name: /Giáo trình MLN112/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));
    expect(await screen.findByText('Đoạn trích đã được đối chiếu.')).toBeInTheDocument();
    const sourceLink = screen.getByRole('link', { name: /Mở nguồn · trang 12/i });
    expect(sourceLink).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/documents\/507f1f77bcf86cd799439012\/pages\/12\?citation=/)
    );
    expect(screen.getByRole('button', { name: 'Báo sai lệch' })).toBeDisabled();
  });

  it('shows truthful loading and unavailable source states without inventing a response', async () => {
    request.mockRejectedValue(new Error('offline'));
    renderPage();
    expect(
      await screen.findByText('Không thể tải danh sách tài liệu để truy xuất.')
    ).toBeInTheDocument();
    expect(screen.getByText(/Chưa có tài liệu nào để truy xuất/i)).toBeInTheDocument();
    expect(screen.queryByText('Một phản hồi có căn cứ.')).not.toBeInTheDocument();
  });

  it('uploads a private PDF from the sources rail without sending a course scope', async () => {
    const uploaded = {
      id: '507f1f77bcf86cd799439013',
      title: 'Báo cáo riêng',
      status: 'ready',
      mimeType: 'application/pdf',
      originalFileName: 'bao-cao.pdf',
      byteSize: 12,
      pageCount: 2,
      errorCode: null,
      errorMessage: null,
      createdAt: '2026-07-20T00:00:00.000Z',
      updatedAt: '2026-07-20T00:00:00.000Z'
    };
    let privateDocuments: (typeof uploaded)[] = [];
    request.mockImplementation((path: string, init?: RequestInit) => {
      if (path === '/rag/documents?courseId=MLN112')
        return Promise.resolve([
          { id: '507f1f77bcf86cd799439012', title: 'Giáo trình MLN112', pageCount: 80 }
        ]);
      if (path === '/copilot/documents' && init?.method === 'POST') {
        privateDocuments = [uploaded];
        return Promise.resolve(uploaded);
      }
      if (path === '/copilot/documents') return Promise.resolve(privateDocuments);
      return Promise.resolve({});
    });
    renderPage();
    const file = new File(['%PDF-test'], 'bao-cao.pdf', { type: 'application/pdf' });
    fireEvent.change(screen.getByLabelText('Tải tài liệu lên Copilot'), {
      target: { files: [file] }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tải tài liệu lên' }));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/copilot/documents', expect.anything())
    );
    const uploadCall = request.mock.calls.find((call: unknown[]) => {
      const [path, init] = call as [unknown, RequestInit | undefined];
      return path === '/copilot/documents' && init?.method === 'POST';
    }) as [string, RequestInit] | undefined;
    const body = uploadCall?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('file')).toBe(file);
    expect((body as FormData).get('courseId')).toBeNull();
    expect(await screen.findByText('Báo cáo riêng')).toBeInTheDocument();
  });
});
