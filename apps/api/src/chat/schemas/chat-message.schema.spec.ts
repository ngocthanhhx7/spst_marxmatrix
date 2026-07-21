import { model, Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { ChatMessageRecordSchema } from './chat-message.schema.js';

const ChatMessageModel = model('ChatMessageSchemaSpec', ChatMessageRecordSchema);

describe('ChatMessageRecordSchema', () => {
  it('allows an image-only user message with empty text', async () => {
    const message = new ChatMessageModel({
      ownerId: new Types.ObjectId(),
      conversationId: new Types.ObjectId(),
      role: 'user',
      text: '',
      attachmentIds: [new Types.ObjectId()],
      status: 'pending'
    });

    await expect(message.validate()).resolves.toBeUndefined();
  });

  it('rejects an explicit null message text', async () => {
    const message = new ChatMessageModel({
      ownerId: new Types.ObjectId(),
      conversationId: new Types.ObjectId(),
      role: 'user',
      text: null,
      attachmentIds: [new Types.ObjectId()],
      status: 'pending'
    });

    await expect(message.validate()).rejects.toThrow('Message text must be a string.');
  });
});
