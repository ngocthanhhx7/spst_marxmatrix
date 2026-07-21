import { z } from 'zod';
import { DomainError } from '../common/domain-error.js';

export type ChatCursorValue = { timestamp: string; id: string };

const chatCursorValueSchema = z
  .object({
    timestamp: z.iso.datetime({ offset: true }),
    id: z.string().regex(/^[a-f\d]{24}$/i)
  })
  .strict();

export function encodeChatCursor(value: ChatCursorValue): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

export function decodeChatCursor(value: string): ChatCursorValue {
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Malformed base64url.');
    const decoded = Buffer.from(value, 'base64url');
    if (decoded.toString('base64url') !== value) throw new Error('Non-canonical base64url.');
    return chatCursorValueSchema.parse(JSON.parse(decoded.toString('utf8')) as unknown);
  } catch {
    throw new DomainError('VALIDATION_ERROR', 'Chat cursor is invalid.', 400);
  }
}
