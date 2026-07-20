import { describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  arenaDecisionSchema,
  clientToServerEventsSchema,
  financialFactSchema,
  gameSnapshotSchema,
  ragResponseSchema,
  serverToClientEventsSchema,
  financialExtractionResultSchema,
  updateAnalysisAssumptionsSchema,
  createAnalysisInputSchema,
  analysisDetailSchema,
  type ClientToServerEvents,
  type ServerToClientEvents
} from './index.js';

const fact = {
  key: 'revenue',
  label: 'Revenue',
  value: 100,
  currency: 'usd',
  scale: 'millions',
  reportingPeriod: '2025',
  classification: 'revenue',
  extractionMode: 'manual',
  sourcePage: null,
  sourceChunkId: null,
  evidenceText: null,
  classificationReason: 'Manual entry',
  reviewStatus: 'approved'
};
const decision = {
  gameId: '507f1f77bcf86cd799439011',
  round: 1,
  expectedStateVersion: 0,
  idempotencyKey: '5db560db-86e6-4a08-a7c5-444a3311a7e8',
  hiringChange: 0,
  wageAdjustment: 0,
  automationInvestment: 10,
  price: 20,
  qualityMarketingInvestment: 0,
  inventoryTarget: 20
};
const snapshot = {
  id: '507f1f77bcf86cd799439011',
  roomId: '507f1f77bcf86cd799439012',
  stateVersion: 0,
  round: 1,
  phase: 'decision_open',
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
  companies: [
    {
      playerId: '507f1f77bcf86cd799439013',
      name: 'Factory',
      cash: 100,
      capitalStock: 100,
      workers: 10,
      wageRate: 1,
      automationLevel: 0,
      productivity: 1,
      reputation: 0.5,
      marketShare: 0.5,
      price: 20,
      inventory: 0,
      debt: 0,
      constantCapital: 50,
      variableCapital: 10,
      surplusValue: 40,
      bankrupt: false
    }
  ],
  randomSeed: 'contract-seed',
  decisions: {},
  crisis: null,
  eventSequence: 0
};

describe('review contract coverage', () => {
  it('accepts complete Scanner and Arena representative objects', () => {
    expect(financialFactSchema.parse(fact).currency).toBe('USD');
    expect(gameSnapshotSchema.parse(snapshot).companies).toHaveLength(1);
    expect(arenaDecisionSchema.parse(decision).round).toBe(1);
  });

  it('rejects an invalid financial classification independently', () => {
    expect(() => financialFactSchema.parse({ ...fact, classification: 'income' })).toThrow();
  });
  it('rejects a non-finite financial value independently', () => {
    expect(() => financialFactSchema.parse({ ...fact, value: Infinity })).toThrow();
  });
  it('requires a complete assumptions replacement payload', () => {
    expect(() => updateAnalysisAssumptionsSchema.parse({ revenueAdjustment: 0.9 })).toThrow();
    expect(
      updateAnalysisAssumptionsSchema.parse({
        revenueAdjustment: 0.9,
        includeSurplusProxy: false,
        contractorClassification: 'constant_capital',
        includeStockCompensation: false,
        includeNeedsReview: false,
        notes: ''
      }).revenueAdjustment
    ).toBe(0.9);
  });
  it('exposes finalized state on analysis details', () => {
    expect(analysisDetailSchema.shape.finalized.parse(true)).toBe(true);
  });

  it('does not allow manual-create clients to claim extracted or imported facts', () => {
    expect(() =>
      createAnalysisInputSchema.parse({
        title: 'Untrusted extraction',
        facts: [{ ...fact, extractionMode: 'ai_extracted', reviewStatus: 'approved' }]
      })
    ).toThrow();
  });
  it('rejects an invalid decision round independently', () => {
    expect(() => arenaDecisionSchema.parse({ ...decision, round: 0 })).toThrow();
  });
  it('rejects an invalid arena phase independently', () => {
    expect(() => gameSnapshotSchema.parse({ ...snapshot, phase: 'invalid' })).toThrow();
  });
  it('rejects an invalid state version independently', () => {
    expect(() => arenaDecisionSchema.parse({ ...decision, expectedStateVersion: -1 })).toThrow();
  });
  it('rejects an invalid idempotency UUID independently', () => {
    expect(() => arenaDecisionSchema.parse({ ...decision, idempotencyKey: 'bad' })).toThrow();
  });
  it('rejects NaN money independently', () => {
    expect(() =>
      arenaDecisionSchema.parse({ ...decision, automationInvestment: Number.NaN })
    ).toThrow();
  });

  it('rejects claim citations outside the response citation array', () => {
    expect(() =>
      ragResponseSchema.parse({
        mode: 'outline',
        answer: 'x',
        simulated: true,
        claims: [{ text: 'x', citationIndexes: [1] }],
        citations: [
          {
            chunkId: '507f1f77bcf86cd799439011',
            documentId: '507f1f77bcf86cd799439012',
            pageStart: 1,
            pageEnd: 1,
            quote: 'x'
          }
        ],
        warning: null
      })
    ).toThrow();
  });
  it('requires AI-extracted evidence facts to remain pending review', () => {
    const aiFact = {
      ...fact,
      extractionMode: 'ai_extracted',
      reviewStatus: 'pending_review',
      sourcePage: 1,
      sourceChunkId: '507f1f77bcf86cd799439011',
      evidenceText: 'Page evidence'
    };
    expect(
      financialExtractionResultSchema.parse({
        facts: [aiFact],
        simulated: false,
        model: 'mock',
        promptVersion: 'v1'
      }).facts
    ).toHaveLength(1);
    expect(() =>
      financialExtractionResultSchema.parse({
        facts: [{ ...aiFact, reviewStatus: 'approved' }],
        simulated: false,
        model: 'mock',
        promptVersion: 'v1'
      })
    ).toThrow();
    expect(() =>
      financialExtractionResultSchema.parse({
        facts: [{ ...aiFact, evidenceText: null }],
        simulated: false,
        model: 'mock',
        promptVersion: 'v1'
      })
    ).toThrow();
  });
  it('requires structural RAG support or an explicit warning-only response', () => {
    expect(() =>
      ragResponseSchema.parse({
        mode: 'outline',
        answer: 'x',
        simulated: true,
        claims: [{ text: 'x', citationIndexes: [] }],
        citations: [],
        warning: 'Insufficient sources'
      })
    ).toThrow();
    expect(() =>
      ragResponseSchema.parse({
        mode: 'outline',
        answer: 'x',
        simulated: true,
        claims: [],
        citations: [],
        warning: null
      })
    ).toThrow();
    expect(
      ragResponseSchema.parse({
        mode: 'outline',
        answer: 'x',
        simulated: true,
        claims: [],
        citations: [],
        warning: 'Insufficient sources'
      }).warning
    ).toBeTruthy();
  });

  it('uses the exact shared API error contract for server errors', () => {
    const serverError = {
      statusCode: 400,
      code: 'BAD_INPUT',
      message: 'Invalid input',
      details: [],
      requestId: '5db560db-86e6-4a08-a7c5-444a3311a7e8'
    };
    expect(serverToClientEventsSchema.shape['server:error']).toBe(apiErrorSchema);
    expect(serverToClientEventsSchema.shape['server:error'].parse(serverError)).toEqual(
      apiErrorSchema.parse(serverError)
    );
    expect(() =>
      serverToClientEventsSchema.shape['server:error'].parse({ ...serverError, statusCode: 200 })
    ).toThrow();
    expect(() =>
      serverToClientEventsSchema.shape['server:error'].parse({ ...serverError, code: '' })
    ).toThrow();
    expect(() =>
      serverToClientEventsSchema.shape['server:error'].parse({ ...serverError, message: '' })
    ).toThrow();
  });

  it('parses socket payloads and typechecks Socket.IO event maps', () => {
    const consume = <T>(payload: T): void => {
      void payload;
    };
    const clientEvents: ClientToServerEvents = {
      'room:join': consume,
      'room:ready': consume,
      'room:start': consume,
      'game:decision': consume,
      'game:sync': consume
    };
    const serverEvents: ServerToClientEvents = {
      'server:error': consume,
      'room:updated': consume,
      'game:snapshot': consume,
      'game:event': consume
    };
    expect(Object.keys(clientEvents)).toHaveLength(5);
    expect(Object.keys(serverEvents)).toHaveLength(4);
    expect(
      clientToServerEventsSchema.shape['room:start'].parse({
        roomId: decision.gameId,
        expectedStateVersion: 0
      })
    ).toMatchObject({ expectedStateVersion: 0 });
    expect(clientToServerEventsSchema.shape['game:decision'].parse(decision)).toEqual(decision);
    expect(serverToClientEventsSchema.shape['game:snapshot'].parse(snapshot)).toMatchObject(
      snapshot
    );
  });
});
