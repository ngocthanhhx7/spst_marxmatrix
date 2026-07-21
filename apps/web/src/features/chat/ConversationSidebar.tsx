import type { ChatConversationSummary } from './chat.types.js';

export function ConversationSidebar({
  activeId,
  conversations,
  drawerOpen,
  onClose,
  onCreate,
  onDelete,
  onSelect
}: {
  activeId?: string | undefined;
  conversations: ChatConversationSummary[];
  drawerOpen: boolean;
  onClose: () => void;
  onCreate: () => void;
  onDelete: (conversation: ChatConversationSummary) => void;
  onSelect: (conversation: ChatConversationSummary) => void;
}) {
  return (
    <aside
      id="chat-conversations"
      className="chat-sidebar"
      data-open={drawerOpen}
      aria-label="Cuộc trò chuyện"
    >
      <div className="chat-sidebar__brand">
        <strong>MarxMatrix Terminal</strong>
        <span>SYSTEM_ACTIVE</span>
      </div>
      <button
        aria-label="Đóng lịch sử"
        className="chat-sidebar__close"
        type="button"
        onClick={onClose}
      >
        Đóng
      </button>
      <button
        aria-label="Cuộc trò chuyện mới"
        className="chat-sidebar__new"
        type="button"
        onClick={onCreate}
      >
        + Cuộc trò chuyện mới
      </button>
      <p className="chat-sidebar__label">GẦN ĐÂY</p>
      {conversations.length === 0 ? (
        <p className="chat-sidebar__empty">Chưa có cuộc trò chuyện nào.</p>
      ) : (
        <ul className="chat-sidebar__list">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                aria-current={conversation.id === activeId ? 'page' : undefined}
                className={conversation.id === activeId ? 'is-active' : undefined}
                type="button"
                onClick={() => onSelect(conversation)}
              >
                {conversation.title}
              </button>
              <button
                type="button"
                aria-label={`Xóa ${conversation.title}`}
                onClick={() => onDelete(conversation)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
