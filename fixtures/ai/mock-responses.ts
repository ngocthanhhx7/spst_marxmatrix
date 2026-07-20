import type { FinancialExtractionInput, FinancialExtractionResult } from '@marxmatrix/contracts';

/** Deterministic demo-only response. It never represents a real model call. */
export function mockFinancialExtractionResponse(
  input: FinancialExtractionInput
): FinancialExtractionResult {
  const source = input.chunks[0];
  if (source === undefined)
    throw new RangeError('A source chunk is required for financial extraction.');
  return {
    facts: [
      {
        key: 'reported_financial_line',
        label: 'Reported financial line item',
        value: 0,
        currency: 'USD',
        scale: 'ones',
        reportingPeriod: 'Unconfirmed reporting period',
        classification: 'needs_review',
        extractionMode: 'ai_extracted',
        reviewStatus: 'pending_review',
        sourcePage: source.sourcePage,
        sourceChunkId: source.sourceChunkId,
        evidenceText: source.text.slice(0, 5000),
        classificationReason: 'Simulated extraction requires human review.',
        sensitivityCategory: 'standard',
        sensitivityClassification: null
      }
    ],
    simulated: true,
    model: 'mock-financial-extraction',
    promptVersion: 'financial-extraction-v1',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  };
}
