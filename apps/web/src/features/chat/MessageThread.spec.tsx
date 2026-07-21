import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChatMessage } from './chat.types.js';
import { MessageThread } from './MessageThread.js';

const messages: ChatMessage[] = [
  {
    id: '507f1f77bcf86cd799439011',
    conversationId: '507f1f77bcf86cd799439012',
    role: 'user',
    text: 'Giải thích lãi kép',
    attachments: [],
    status: 'completed',
    scope: null,
    reasonCode: null,
    replyToMessageId: null,
    createdAt: '2026-07-21T06:00:00.000Z'
  },
  {
    id: '507f1f77bcf86cd799439013',
    conversationId: '507f1f77bcf86cd799439012',
    role: 'assistant',
    text: '## Lãi kép\n\nTiền lãi sinh lãi.',
    attachments: [],
    status: 'completed',
    scope: 'finance',
    reasonCode: null,
    replyToMessageId: '507f1f77bcf86cd799439011',
    createdAt: '2026-07-21T06:00:02.000Z'
  }
];

describe('MessageThread', () => {
  it('uses distinct accessible terminal labels for user and assistant messages', () => {
    render(<MessageThread messages={messages} onRegenerate={() => undefined} />);

    expect(screen.getByText('USER_PROMPT')).toBeInTheDocument();
    expect(screen.getByText('SYSTEM_SYNTHESIS')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Lãi kép' })).toBeInTheDocument();
  });

  it('offers regenerate only on completed user messages', () => {
    render(<MessageThread messages={messages} onRegenerate={() => undefined} />);

    expect(screen.getByRole('button', { name: 'Tạo lại phản hồi' })).toBeInTheDocument();
  });
});

afterEach(cleanup);
