import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPage } from './ChatPage.js';
import { chatApi } from './chat.api.js';

vi.mock('./chat.api.js', () => ({
  chatApi: {
    createConversation: vi.fn(),
    cancel: vi.fn(),
    deleteConversation: vi.fn(),
    getConversation: vi.fn(),
    listConversations: vi.fn().mockResolvedValue({ conversations: [], nextCursor: null }),
    regenerate: vi.fn(),
    sendMessage: vi.fn()
  }
}));

afterEach(cleanup);

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ChatPage />
    </QueryClientProvider>
  );
}

describe('ChatPage', () => {
  it('labels the education and finance boundary before a question is sent', async () => {
    renderPage();

    expect(screen.getByText('CHỈ HỖ TRỢ GIÁO DỤC & TÀI CHÍNH')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Học tập và phân tích cùng AI' })
    ).toBeInTheDocument();
  });

  it('keeps the mobile history drawer closed until its accessible control is used', () => {
    renderPage();

    expect(screen.getByRole('complementary', { name: 'Cuộc trò chuyện' })).toHaveAttribute(
      'data-open',
      'false'
    );
    expect(screen.getByRole('button', { name: 'Lịch sử' })).toHaveAttribute(
      'aria-controls',
      'chat-conversations'
    );
  });

  it('shows stream progress and cancels the first auto-created conversation with its run id', async () => {
    const conversation = {
      id: '507f1f77bcf86cd799439011',
      title: 'Cuộc trò chuyện mới',
      createdAt: '2026-07-21T06:00:00.000Z',
      updatedAt: '2026-07-21T06:00:00.000Z'
    };
    const runId = 'a28f1b60-f41c-4f85-ae58-e0d061f3c5ad';
    vi.mocked(chatApi.createConversation).mockResolvedValueOnce(conversation);
    vi.mocked(chatApi.sendMessage).mockImplementationOnce(async (_id, _input, onEvent) => {
      onEvent({ type: 'checking_scope', runId });
      await new Promise<void>(() => undefined);
    });

    renderPage();
    fireEvent.change(screen.getByRole('textbox', { name: 'Yêu cầu cho AI' }), {
      target: { value: 'Giải thích lãi kép' }
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Đang kiểm tra phạm vi');
    fireEvent.click(screen.getByRole('button', { name: 'Dừng phản hồi' }));
    await waitFor(() => expect(chatApi.cancel).toHaveBeenCalledWith(conversation.id, runId));
  });
});
