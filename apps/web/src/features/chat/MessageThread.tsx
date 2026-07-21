import type { ChatMessage } from './chat.types.js';
import { SafeMarkdown } from './SafeMarkdown.js';

export function MessageThread({
  messages,
  onRegenerate
}: {
  messages: ChatMessage[];
  onRegenerate: (message: ChatMessage) => void;
}) {
  if (messages.length === 0) return <ChatEmptyState />;

  return (
    <section className="chat-thread" aria-label="Hội thoại AI">
      {messages.map((message) => {
        const isUser = message.role === 'user';
        return (
          <article className={`chat-message chat-message--${message.role}`} key={message.id}>
            <p className="chat-message__meta">{isUser ? 'USER_PROMPT' : 'SYSTEM_SYNTHESIS'}</p>
            <div className="chat-message__body">
              {isUser ? <p>{message.text}</p> : <SafeMarkdown markdown={message.text} />}
              {message.attachments.length > 0 && (
                <ul className="chat-message__attachments" aria-label="Ảnh đính kèm">
                  {message.attachments.map((attachment) => (
                    <li key={attachment.id}>{attachment.originalFileName}</li>
                  ))}
                </ul>
              )}
            </div>
            {isUser && message.status === 'completed' && (
              <button
                className="chat-message__regenerate"
                type="button"
                onClick={() => onRegenerate(message)}
              >
                Tạo lại phản hồi
              </button>
            )}
          </article>
        );
      })}
    </section>
  );
}

function ChatEmptyState() {
  return (
    <section className="chat-empty" aria-labelledby="chat-empty-heading">
      <p className="chat-empty__icon" aria-hidden="true">
        ⊞
      </p>
      <h1 id="chat-empty-heading">Học tập và phân tích cùng AI</h1>
      <p>
        Đặt câu hỏi hoặc tải ảnh biểu đồ để nhận giải thích trong phạm vi giáo dục và tài chính.
      </p>
    </section>
  );
}
