import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatConversationSummary } from './chat.types.js';
import { ConversationSidebar } from './ConversationSidebar.js';

const conversation: ChatConversationSummary = {
  id: '507f1f77bcf86cd799439011',
  title: 'Phân tích lãi kép',
  createdAt: '2026-07-21T06:00:00.000Z',
  updatedAt: '2026-07-21T06:01:00.000Z'
};

describe('ConversationSidebar', () => {
  it('selects the active conversation and creates a new one', () => {
    const onCreate = vi.fn();
    const onSelect = vi.fn();
    render(
      <ConversationSidebar
        activeId={conversation.id}
        conversations={[conversation]}
        drawerOpen={false}
        onClose={() => undefined}
        onCreate={onCreate}
        onDelete={() => undefined}
        onSelect={onSelect}
      />
    );

    expect(screen.getByRole('button', { name: conversation.title })).toHaveAttribute(
      'aria-current',
      'page'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cuộc trò chuyện mới' }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('states when there is no saved conversation', () => {
    render(
      <ConversationSidebar
        activeId={undefined}
        conversations={[]}
        drawerOpen={false}
        onClose={() => undefined}
        onCreate={() => undefined}
        onDelete={() => undefined}
        onSelect={() => undefined}
      />
    );

    expect(screen.getByText('Chưa có cuộc trò chuyện nào.')).toBeInTheDocument();
  });
});

afterEach(cleanup);
