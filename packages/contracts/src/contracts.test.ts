import { describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  arenaDecisionSchema,
  calculationResultSchema,
  citationSchema,
  financialFactSchema,
  gameSnapshotSchema,
  publicUserSchema,
  ragResponseSchema
} from './index.js';
import { ragModeSchema } from './rag.js';

describe('shared contracts', () => {
  it('accepts query as a grounded Copilot response mode', () => {
    expect(ragModeSchema.parse('query')).toBe('query');
  });
  it('models evidence coverage as a bounded percentage', () => {
    const result = {
      constantCapital: 400,
      variableCapital: 200,
      adjustedRevenue: 1000,
      surplusValue: 400,
      surplusValueRate: 200,
      organicComposition: 2,
      profitRate: 66.67,
      evidenceCoverage: 100
    };
    expect(calculationResultSchema.parse(result).evidenceCoverage).toBe(100);
    expect(() => calculationResultSchema.parse({ ...result, evidenceCoverage: 100.01 })).toThrow();
  });

  it('accepts a complete representative transport object', () => {
    expect(
      publicUserSchema.parse({
        id: '507f1f77bcf86cd799439011',
        email: 'student@example.com',
        role: 'student',
        displayName: 'Student'
      })
    ).toMatchObject({ email: 'student@example.com' });
    expect(
      apiErrorSchema.parse({
        statusCode: 400,
        code: 'INVALID_INPUT',
        message: 'Input is invalid',
        details: [],
        requestId: '5db560db-86e6-4a08-a7c5-444a3311a7e8'
      })
    ).toMatchObject({ statusCode: 400 });
  });

  it('rejects invalid identifiers, classifications, and non-finite money', () => {
    expect(() =>
      publicUserSchema.parse({
        id: 'not-an-id',
        email: 'a@b.com',
        role: 'student',
        displayName: 'A'
      })
    ).toThrow();
    expect(() =>
      financialFactSchema.parse({
        key: 'revenue',
        label: 'Revenue',
        value: Infinity,
        currency: 'USD',
        scale: 'ones',
        reportingPeriod: '2025',
        classification: 'income',
        extractionMode: 'manual',
        sourcePage: 1,
        sourceChunkId: '507f1f77bcf86cd799439011',
        evidenceText: 'x',
        classificationReason: 'x',
        reviewStatus: 'approved'
      })
    ).toThrow();
    expect(() =>
      financialFactSchema.parse({
        key: 'revenue',
        label: 'Revenue',
        value: 1,
        currency: 'USD',
        scale: 'ones',
        reportingPeriod: '2025',
        classification: 'income',
        extractionMode: 'manual',
        sourcePage: 1,
        sourceChunkId: '507f1f77bcf86cd799439011',
        evidenceText: 'x',
        classificationReason: 'x',
        reviewStatus: 'approved'
      })
    ).toThrow();
  });

  it('rejects malformed citations and invalid arena payloads', () => {
    expect(() =>
      citationSchema.parse({
        chunkId: '507f1f77bcf86cd799439011',
        documentId: '507f1f77bcf86cd799439011',
        pageStart: 3,
        pageEnd: 2,
        quote: 'x'
      })
    ).toThrow();
    expect(() =>
      arenaDecisionSchema.parse({
        gameId: '507f1f77bcf86cd799439011',
        round: 0,
        expectedStateVersion: -1,
        idempotencyKey: 'not-uuid',
        hiringChange: 0,
        wageAdjustment: Number.NaN,
        automationInvestment: 0,
        price: 20,
        qualityMarketingInvestment: 0,
        inventoryTarget: 0
      })
    ).toThrow();
    expect(() =>
      gameSnapshotSchema.parse({
        id: '507f1f77bcf86cd799439011',
        roomId: '507f1f77bcf86cd799439012',
        stateVersion: 1,
        round: 0,
        phase: 'invalid',
        deadlineAt: '2026-01-01T00:00:00.000Z',
        config: {
          maxRounds: 8,
          minPlayers: 2,
          maxPlayers: 4,
          startingCash: 100,
          startingWorkers: 10,
          startingWageRate: 1,
          decisionDeadlineMs: 30000
        },
        companies: []
      })
    ).toThrow();
  });

  it('accepts grounded RAG responses with bounded page citations', () => {
    expect(
      ragResponseSchema.parse({
        mode: 'outline',
        answer: 'Grounded answer',
        simulated: true,
        claims: [{ text: 'Claim', citationIndexes: [0] }],
        citations: [
          {
            chunkId: '507f1f77bcf86cd799439011',
            documentId: '507f1f77bcf86cd799439012',
            pageStart: 1,
            pageEnd: 1,
            quote: 'Evidence'
          }
        ],
        warning: null
      })
    ).toMatchObject({ simulated: true });
  });
});
