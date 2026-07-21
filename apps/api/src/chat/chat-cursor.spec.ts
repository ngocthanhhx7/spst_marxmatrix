import { describe, expect, it } from 'vitest';
import { decodeChatCursor, encodeChatCursor } from './chat-cursor.js';

const value = {
  timestamp: '2026-07-21T03:04:05.000Z',
  id: '507f1f77bcf86cd799439011'
};

describe('chat cursor codec', () => {
  it('round-trips the exact timestamp and id tuple', () => {
    expect(decodeChatCursor(encodeChatCursor(value))).toEqual(value);
  });

  it('encodes opaque unpadded base64url text', () => {
    const encoded = encodeChatCursor(value);

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(encoded).not.toContain('=');
    expect(encoded).not.toContain(value.timestamp);
    expect(encoded).not.toContain(value.id);
  });

  it.each([
    ['malformed base64url', 'not base64!'],
    ['malformed JSON', Buffer.from('{', 'utf8').toString('base64url')],
    ['non-object JSON', Buffer.from('null', 'utf8').toString('base64url')],
    [
      'missing schema field',
      Buffer.from(JSON.stringify({ timestamp: value.timestamp }), 'utf8').toString('base64url')
    ],
    [
      'extra schema field',
      Buffer.from(JSON.stringify({ ...value, extra: true }), 'utf8').toString('base64url')
    ],
    [
      'invalid ObjectId',
      Buffer.from(JSON.stringify({ ...value, id: 'not-an-object-id' }), 'utf8').toString(
        'base64url'
      )
    ],
    [
      'invalid ISO date',
      Buffer.from(JSON.stringify({ ...value, timestamp: '2026-07-21' }), 'utf8').toString(
        'base64url'
      )
    ]
  ])('rejects %s with the same validation error', (_case, cursor) => {
    expect(() => decodeChatCursor(cursor)).toThrowError(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        message: 'Chat cursor is invalid.',
        statusCode: 400
      })
    );
  });
});
