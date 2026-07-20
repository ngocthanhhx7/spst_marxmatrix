import { describe, expect, it, vi } from 'vitest';
import {
  FinancialExtractionService,
  financialExtractionFingerprint
} from './financial-extraction.service.js';

const documentId = '507f1f77bcf86cd799439011';
const analysisId = '507f1f77bcf86cd799439012';
const ownerId = '507f1f77bcf86cd799439013';
const chunkId = '507f1f77bcf86cd799439014';

const providerFact = {
  key: 'revenue',
  label: 'Revenue',
  value: 100,
  currency: 'USD',
  scale: 'millions',
  reportingPeriod: 'FY2025',
  classification: 'revenue',
  extractionMode: 'ai_extracted',
  reviewStatus: 'pending_review',
  sourcePage: 1,
  sourceChunkId: chunkId,
  evidenceText: 'Revenue for FY2025 was USD 100 million.',
  classificationReason: 'Reported revenue line item.',
  sensitivityCategory: 'standard',
  sensitivityClassification: null
};

function dependencies(options?: { fingerprint?: string | null; evidence?: string }) {
  const provider = {
    financialExtractionPromptVersion: 'financial-extraction-v1',
    extractFinancialFacts: vi.fn().mockResolvedValue({
      facts: [{ ...providerFact, evidenceText: options?.evidence ?? providerFact.evidenceText }],
      simulated: true,
      model: 'mock-financial-extraction',
      promptVersion: 'financial-extraction-v1',
      usage: { totalTokens: 1 }
    })
  };
  const analysis = {
    _id: { toString: () => analysisId },
    ownerId: { toString: () => ownerId },
    stateVersion: 4,
    financialExtractionFingerprint: options?.fingerprint ?? null,
    financialExtractionInProgressFingerprint: null,
    financialExtractionDocumentId: null,
    financialExtractionParseToken: null,
    facts: []
  };
  const analyses = {
    findOne: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue(analysis) }),
    findOneAndUpdate: vi.fn().mockResolvedValue(analysis),
    updateOne: vi.fn().mockResolvedValue(undefined)
  };
  const jobs = { enqueue: vi.fn().mockResolvedValue({ _id: { toString: () => 'job-1' } }) };
  const logger = { log: vi.fn<(record: Record<string, unknown>) => void>() };
  const documents = {
    findOne: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({
        _id: { toString: () => documentId },
        ownerId: { toString: () => ownerId },
        parsedPageToken: 'parse-v1',
        status: 'parsed'
      })
    }),
    exists: vi.fn().mockResolvedValue({ _id: documentId })
  };
  return {
    provider,
    analyses,
    jobs,
    logger,
    documents,
    service: new FinancialExtractionService(
      documents as never,
      {
        find: vi.fn().mockReturnValue({
          sort: vi.fn().mockResolvedValue([
            {
              _id: { toString: () => chunkId },
              pageNumber: 1,
              text: 'Revenue for FY2025 was USD 100 million.',
              sourceChunkIds: [{ toString: () => chunkId }]
            }
          ])
        })
      } as never,
      analyses as never,
      provider,
      jobs as never,
      logger
    )
  };
}

describe('FinancialExtractionService', () => {
  it('lists only evidence-backed AI facts for an owner-scoped document', async () => {
    const analysisFact = {
      _id: { toString: () => '507f1f77bcf86cd799439015' },
      ...providerFact,
      classification: 'needs_review',
      reviewStatus: 'pending_review'
    };
    const service = new FinancialExtractionService(
      {
        findOne: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ _id: { toString: () => documentId } })
        })
      } as never,
      {} as never,
      {
        find: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            sort: vi.fn().mockResolvedValue([
              {
                facts: [analysisFact],
                financialExtractionSimulated: true,
                financialExtractionModel: 'mock-financial-extraction',
                financialExtractionPromptVersion: 'financial-extraction-v1',
                financialExtractionUsage: { totalTokens: 1 }
              }
            ])
          })
        })
      } as never,
      {} as never,
      {} as never
    );

    await expect(service.listForDocument(ownerId, documentId)).resolves.toMatchObject({
      facts: [
        {
          id: '507f1f77bcf86cd799439015',
          sourcePage: 1,
          evidenceText: providerFact.evidenceText,
          reviewStatus: 'pending_review'
        }
      ],
      simulated: true,
      model: 'mock-financial-extraction',
      promptVersion: 'financial-extraction-v1',
      usage: { totalTokens: 1 }
    });
  });

  it('owner-scopes and idempotently queues extraction for a parsed document and analysis', async () => {
    const { service, jobs, analyses } = dependencies();

    await expect(service.queue(ownerId, documentId, analysisId)).resolves.toEqual({
      status: 'queued',
      documentId,
      analysisId
    });
    expect(jobs.enqueue).toHaveBeenCalledWith({
      type: 'extract_financials',
      payload: { documentId, analysisId },
      idempotencyKey: `extract_financials:${documentId}:${analysisId}:parse-v1`
    });
    expect(analyses.findOne).toHaveBeenCalled();
  });

  it('atomically requeues the deterministic extraction job after a terminal provider failure', async () => {
    const { service, jobs } = dependencies();
    jobs.enqueue.mockResolvedValue({
      _id: { toString: () => '507f1f77bcf86cd799439099' },
      status: 'failed'
    });
    const requeueFailed = vi.fn().mockResolvedValue({ status: 'queued' });
    Object.assign(jobs, { requeueFailed });

    await expect(service.queue(ownerId, documentId, analysisId)).resolves.toMatchObject({
      status: 'queued'
    });
    expect(requeueFailed).toHaveBeenCalledWith('507f1f77bcf86cd799439099');
  });

  it('does not commit facts when the document parse token changes during the provider call', async () => {
    const { service, analyses, documents } = dependencies();
    documents.findOne.mockReset();
    documents.findOne
      .mockReturnValueOnce({
        select: vi.fn().mockResolvedValue({
          _id: { toString: () => documentId },
          ownerId: { toString: () => ownerId },
          parsedPageToken: 'parse-v1',
          status: 'parsed'
        })
      })
      .mockReturnValueOnce({
        select: vi.fn().mockResolvedValue({
          _id: { toString: () => documentId },
          ownerId: { toString: () => ownerId },
          parsedPageToken: 'parse-v2',
          status: 'parsed'
        })
      });

    await expect(service.extract(documentId, analysisId)).rejects.toMatchObject({
      code: 'EXTRACTION_SOURCE_CHANGED'
    });
    expect(analyses.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('requires page/chunk/evidence and persists AI facts as needs_review without a calculator', async () => {
    const { service, analyses, provider, logger } = dependencies();

    const result = await service.extract(documentId, analysisId);

    expect(result).toBe('completed');
    expect(provider.extractFinancialFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        pageNumbers: [1],
        chunks: [expect.objectContaining({ sourceChunkId: chunkId })]
      })
    );
    expect(analyses.findOneAndUpdate).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        $push: {
          facts: {
            $each: [
              expect.objectContaining({
                classification: 'needs_review',
                reviewStatus: 'pending_review',
                sourcePage: 1,
                sourceChunkId: chunkId
              })
            ]
          }
        }
      }),
      expect.anything()
    );
    expect(logger.log).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'financial_extraction_provider_completed',
        inputTokens: null,
        outputTokens: null,
        totalTokens: 1
      })
    );
    const safeLog = logger.log.mock.calls[0]?.[0];
    expect(safeLog?.['durationMs']).toBeTypeOf('number');
    expect(JSON.stringify(logger.log.mock.calls)).not.toContain(providerFact.evidenceText);
  });

  it('rejects evidence that is not grounded in its source chunk', async () => {
    const { service, analyses } = dependencies({ evidence: 'Fabricated evidence.' });

    await expect(service.extract(documentId, analysisId)).rejects.toMatchObject({
      code: 'EXTRACTION_EVIDENCE_INVALID'
    });
    expect(analyses.findOneAndUpdate).toHaveBeenCalledTimes(1);
  });

  it('skips a completed extraction fingerprint after a reviewer reclassifies its facts', async () => {
    const { service, provider, analyses } = dependencies({
      fingerprint: financialExtractionFingerprint(
        documentId,
        'parse-v1',
        'financial-extraction-v1',
        [
          {
            sourcePage: 1,
            sourceChunkId: chunkId,
            text: 'Revenue for FY2025 was USD 100 million.'
          }
        ]
      )
    });

    // The public operation uses the persisted input fingerprint, never fact classification, to avoid another AI call.
    const result = await service.extract(documentId, analysisId);
    expect(result).toBe('already-complete');
    expect(provider.extractFinancialFacts).not.toHaveBeenCalled();
    expect(analyses.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
