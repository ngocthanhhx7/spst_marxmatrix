import { describe, expect, it } from 'vitest';
import {
  CHAT_MAX_IMAGES,
  chatConversationDetailSchema,
  chatMessageInputSchema,
  chatStreamEventSchema
} from './chat.js';

const id = '507f1f77bcf86cd799439011';
const timestamp = '2026-07-21T04:00:00.000Z';

describe('chat contracts', () => {
  it('requires text or an image within the attachment limit', () => {
    expect(chatMessageInputSchema.parse({ text: '', imageCount: 1 })).toEqual({ text: '', imageCount: 1 });
    expect(() => chatMessageInputSchema.parse({ text: '   ', imageCount: 0 })).toThrow(
      'A message requires text or at least one image.'
    );
    expect(() => chatMessageInputSchema.parse({ text: '', imageCount: CHAT_MAX_IMAGES + 1 })).toThrow();
  });

  it('uses typed progress stages and permits either message role in terminal events', () => {
    expect(
      chatStreamEventSchema.parse({
        type: 'checking_scope',
        runId: '123e4567-e89b-12d3-a456-426614174000'
      })
    ).toEqual({ type: 'checking_scope', runId: '123e4567-e89b-12d3-a456-426614174000' });
    const message = {
      id,
      conversationId: id,
      role: 'user' as const,
      text: 'A concise answer.',
      attachments: [],
      status: 'completed' as const,
      scope: 'education' as const,
      reasonCode: null,
      replyToMessageId: null,
      createdAt: timestamp
    };

    expect(
      chatStreamEventSchema.parse({
        type: 'final',
        runId: '123e4567-e89b-12d3-a456-426614174000',
        message
      })
    ).toMatchObject({ type: 'final', message: { role: 'user' } });
    expect(
      chatStreamEventSchema.parse({
        type: 'refusal',
        runId: '123e4567-e89b-12d3-a456-426614174000',
        message
      })
    ).toMatchObject({ type: 'refusal', message: { role: 'user' } });
  });

  it('strips internal ownership and storage fields from conversation detail', () => {
    const result = chatConversationDetailSchema.parse({
      id,
      title: 'Budgeting basics',
      createdAt: timestamp,
      updatedAt: timestamp,
      ownerId: id,
      messages: [
        {
          id,
          conversationId: id,
          role: 'user',
          text: 'Explain a budget.',
          attachments: [],
          status: 'completed',
          scope: 'finance',
          reasonCode: null,
          replyToMessageId: null,
          createdAt: timestamp,
          gridFsFileId: id
        }
      ],
      nextCursor: null
    });

    expect(result).not.toHaveProperty('ownerId');
    expect(result.messages[0]).not.toHaveProperty('gridFsFileId');
  });
});
