import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { ChatConversationSummary, ChatMessage, ChatStreamEvent } from './chat.types.js';
import { chatApi } from './chat.api.js';
import { ChatComposer } from './ChatComposer.js';
import { ConversationSidebar } from './ConversationSidebar.js';
import { MessageThread } from './MessageThread.js';
import './ChatPage.css';

type ActiveRun = { conversationId: string; runId?: string };

const progressLabel: Partial<Record<ChatStreamEvent['type'], string>> = {
  checking_scope: 'Đang kiểm tra phạm vi',
  reading_images: 'Đang đọc ảnh',
  generating: 'Đang tạo câu trả lời'
};

export function ChatPage() {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [progress, setProgress] = useState<ChatStreamEvent['type']>();
  const abortRef = useRef<AbortController | undefined>(undefined);
  const activeRunRef = useRef<ActiveRun | undefined>(undefined);

  const conversationsQuery = useQuery({
    queryKey: ['chat', 'conversations'],
    queryFn: () => chatApi.listConversations()
  });
  const detailQuery = useQuery({
    queryKey: ['chat', 'conversation', activeId],
    queryFn: () => chatApi.getConversation(activeId as string),
    enabled: activeId !== undefined
  });
  const createMutation = useMutation({ mutationFn: () => chatApi.createConversation() });
  const activeDetail = detailQuery.data;
  const busy = activeRunRef.current !== undefined;
  const currentProgressLabel = progress === undefined ? undefined : progressLabel[progress];

  const refresh = async (conversationId: string) => {
    await queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
    await queryClient.invalidateQueries({ queryKey: ['chat', 'conversation', conversationId] });
  };

  const create = async () => {
    try {
      const conversation = await createMutation.mutateAsync();
      setActiveId(conversation.id);
      setDrawerOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      return conversation;
    } catch {
      setError('Không thể tạo cuộc trò chuyện mới.');
      return undefined;
    }
  };

  const execute = async (
    work: (
      conversationId: string,
      signal: AbortSignal,
      onEvent: (event: ChatStreamEvent) => void
    ) => Promise<void>
  ) => {
    const conversationId = activeId ?? (await create())?.id;
    if (conversationId === undefined) return false;
    const controller = new AbortController();
    abortRef.current = controller;
    activeRunRef.current = { conversationId };
    setProgress('checking_scope');
    setError(undefined);
    try {
      await work(conversationId, controller.signal, (event) => {
        activeRunRef.current = { conversationId, runId: event.runId };
        setProgress(event.type);
        if (event.type === 'error') setError(event.message);
      });
      await refresh(conversationId);
      return true;
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
        setError('Kết nối bị gián đoạn. Vui lòng thử lại.');
      }
      return false;
    } finally {
      abortRef.current = undefined;
      activeRunRef.current = undefined;
      setProgress(undefined);
    }
  };

  const send = (input: { text: string; images: File[] }) =>
    execute((conversationId, signal, onEvent) =>
      chatApi.sendMessage(conversationId, input, onEvent, signal)
    );

  const regenerate = (message: ChatMessage) =>
    void execute((conversationId, signal, onEvent) =>
      chatApi.regenerate(conversationId, message.id, onEvent, signal)
    );

  const cancel = () => {
    const activeRun = activeRunRef.current;
    abortRef.current?.abort();
    if (activeRun?.runId !== undefined) {
      void Promise.resolve(chatApi.cancel(activeRun.conversationId, activeRun.runId)).catch(
        () => undefined
      );
    }
  };

  const remove = (conversation: ChatConversationSummary) => {
    void chatApi
      .deleteConversation(conversation.id)
      .then(async () => {
        if (activeId === conversation.id) setActiveId(undefined);
        await queryClient.invalidateQueries({ queryKey: ['chat', 'conversations'] });
      })
      .catch(() => setError('Không thể xóa cuộc trò chuyện.'));
  };

  return (
    <div className="chat-workspace" data-drawer-open={drawerOpen}>
      <ConversationSidebar
        activeId={activeId}
        conversations={conversationsQuery.data?.conversations ?? []}
        drawerOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onCreate={() => void create()}
        onDelete={remove}
        onSelect={(conversation) => {
          setActiveId(conversation.id);
          setDrawerOpen(false);
        }}
      />
      <section className="chat-canvas">
        <header className="chat-canvas__header">
          <button
            aria-controls="chat-conversations"
            aria-expanded={drawerOpen}
            className="chat-drawer-toggle"
            type="button"
            onClick={() => setDrawerOpen((open) => !open)}
          >
            Lịch sử
          </button>
          <div>
            <p>AI CHAT</p>
            <h1>{activeDetail?.title ?? 'Phân tích cùng MarxMatrix'}</h1>
          </div>
          <span className="chat-scope">CHỈ HỖ TRỢ GIÁO DỤC &amp; TÀI CHÍNH</span>
        </header>
        {currentProgressLabel && (
          <p className="chat-progress" role="status">
            {currentProgressLabel}
          </p>
        )}
        {error && (
          <p className="chat-error" role="alert">
            {error}
          </p>
        )}
        <MessageThread messages={activeDetail?.messages ?? []} onRegenerate={regenerate} />
        <ChatComposer busy={busy} onCancel={cancel} onSend={send} />
      </section>
    </div>
  );
}
