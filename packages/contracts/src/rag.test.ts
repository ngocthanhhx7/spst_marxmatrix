import { describe, expect, it } from 'vitest';
import { copilotQuerySchema, PERSONAL_COPILOT_COURSE_ID, ragChunkSchema } from './rag.js';

describe('private Copilot query contract', () => {
  it('accepts an owner-scoped query without a client controlled course id', () => {
    expect(PERSONAL_COPILOT_COURSE_ID).toBe('COPILOT01');
    expect(
      copilotQuerySchema.parse({
        documentIds: ['507f1f77bcf86cd799439011'],
        mode: 'query',
        question: 'Tài liệu này nói gì?'
      })
    ).not.toHaveProperty('courseId');
  });
});

describe('RAG embedding contract', () => {
  const chunk = {
    id: '507f1f77bcf86cd799439010',
    ownerId: '507f1f77bcf86cd799439011',
    courseId: 'MLN112',
    documentId: '507f1f77bcf86cd799439012',
    parseToken: 'current-token',
    pageStart: 1,
    pageEnd: 1,
    text: 'retrieval fixture',
    checksum: 'a'.repeat(64)
  };

  it('accepts exactly one 768-dimensional persisted embedding space', () => {
    expect(
      ragChunkSchema.parse({ ...chunk, embedding: new Array<number>(768).fill(0.25) }).embedding
    ).toHaveLength(768);
    expect(() =>
      ragChunkSchema.parse({ ...chunk, embedding: new Array<number>(767).fill(0.25) })
    ).toThrow();
  });
});
