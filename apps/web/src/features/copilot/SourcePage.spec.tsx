import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SourcePage } from './SourcePage.js';
import { createCitationWorkspace, resetCitationWorkspaces } from './citation-workspace.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../shared/api/runtime.js', () => ({ apiClient: { request } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  resetCitationWorkspaces();
});

function renderSource(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <Routes>
          <Route path="/documents/:documentId/pages/:pageNumber" element={<SourcePage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

describe('SourcePage', () => {
  it('keeps a safe session return route and displays line-numbered cited text', async () => {
    const session = createCitationWorkspace({
      input: {
        courseId: 'MLN112',
        documentIds: ['507f1f77bcf86cd799439012'],
        mode: 'query',
        question: 'Giải thích.'
      },
      response: {
        mode: 'query',
        answer: 'Một phản hồi.',
        simulated: false,
        warning: null,
        claims: [],
        citations: [
          {
            chunkId: '507f1f77bcf86cd799439011',
            documentId: '507f1f77bcf86cd799439012',
            pageStart: 12,
            pageEnd: 12,
            quote: 'Đoạn đã dẫn.'
          }
        ]
      }
    });
    request.mockResolvedValue({
      documentId: '507f1f77bcf86cd799439012',
      pageNumber: 12,
      text: 'Dòng mở đầu.\nĐoạn đã dẫn.\nDòng kết.',
      sourceChunkIds: ['507f1f77bcf86cd799439011']
    });
    renderSource(
      `/documents/507f1f77bcf86cd799439012/pages/12?citation=507f1f77bcf86cd799439011&session=${session}`
    );
    expect(await screen.findByRole('mark')).toHaveTextContent('Đoạn đã dẫn.');
    expect(screen.getByText('02')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Quay lại Copilot/i })).toHaveAttribute(
      'href',
      `/copilot?session=${session}`
    );
    expect(
      screen.getByRole('complementary', { name: 'Trích dẫn đang kiểm chứng' })
    ).toHaveTextContent('Đoạn đã dẫn.');
  });

  it('reports unavailable source content honestly and never exposes a forged download URL', async () => {
    request.mockRejectedValue(new Error('offline'));
    renderSource('/documents/507f1f77bcf86cd799439012/pages/12');
    expect(await screen.findByRole('alert')).toHaveTextContent('Không thể mở trang học liệu này');
    expect(screen.getByRole('button', { name: 'Tải bản gốc' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Mở bản gốc' })).toBeDisabled();
  });
});
