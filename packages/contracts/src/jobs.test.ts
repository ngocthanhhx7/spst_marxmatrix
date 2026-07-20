import { describe, expect, it } from 'vitest';
import { jobPayloadForTypeSchema, jobTypeSchema } from './jobs.js';

describe('job contracts', () => {
  it('exposes only canonical worker job types', () => {
    expect(jobTypeSchema.options).toEqual([
      'parse_pdf',
      'extract_financials',
      'embed_document',
      'rebuild_document_index'
    ]);
  });

  it('rejects payload fields outside the type allow-list', () => {
    expect(() =>
      jobPayloadForTypeSchema('parse_pdf').parse({
        documentId: '507f1f77bcf86cd799439011',
        arbitrary: 'not allowed'
      })
    ).toThrow();
    expect(() =>
      jobPayloadForTypeSchema('extract_financials').parse({
        documentId: '507f1f77bcf86cd799439011'
      })
    ).toThrow();
    expect(() =>
      jobPayloadForTypeSchema('parse_pdf').parse({
        documentId: '507f1f77bcf86cd799439011',
        analysisId: '507f1f77bcf86cd799439012'
      })
    ).toThrow();
  });
});
