import { describe, expect, it } from 'vitest';
import { copilotQuerySchema, PERSONAL_COPILOT_COURSE_ID } from './rag.js';

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
