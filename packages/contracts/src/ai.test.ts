import { describe, expect, it } from 'vitest';
import {
  documentExtractionEnvelopeSchema,
  queueFinancialExtractionInputSchema,
  queueFinancialExtractionResultSchema
} from './ai.js';

describe('AI transport contracts', () => {
  it('accepts only an analysis id when queueing document extraction', () => {
    expect(
      queueFinancialExtractionInputSchema.parse({ analysisId: '507f1f77bcf86cd799439011' })
    ).toEqual({ analysisId: '507f1f77bcf86cd799439011' });
    expect(() =>
      queueFinancialExtractionInputSchema.parse({
        analysisId: 'invalid',
        prompt: 'must never be client supplied'
      })
    ).toThrow();
  });

  it('uses stable queued/completed states and a provider metadata envelope', () => {
    expect(
      queueFinancialExtractionResultSchema.parse({
        status: 'queued',
        documentId: '507f1f77bcf86cd799439011',
        analysisId: '507f1f77bcf86cd799439012'
      }).status
    ).toBe('queued');
    expect(
      documentExtractionEnvelopeSchema.parse({
        facts: [],
        simulated: null,
        model: null,
        promptVersion: null,
        usage: null
      })
    ).toMatchObject({ facts: [], simulated: null });
  });
});
