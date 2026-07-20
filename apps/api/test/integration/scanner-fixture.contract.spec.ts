import { readFile } from 'node:fs/promises';
import { createAnalysisInputSchema } from '@marxmatrix/contracts';
import { describe, expect, it } from 'vitest';
import { CalculationService } from '../../src/analyses/domain/calculation.service.js';

describe('Scanner fixture contract', () => {
  it('is a complete createAnalysisInput payload', async () => {
    const source = await readFile(
      new URL('../../../../fixtures/scanner/cloud-platform-2025.json', import.meta.url),
      'utf8'
    );
    const parsed = createAnalysisInputSchema.parse(JSON.parse(source) as unknown);
    expect(parsed.facts).toHaveLength(4);
    expect(parsed.facts.every((fact) => fact.extractionMode === 'manual')).toBe(true);
    expect(parsed.facts.every((fact) => fact.sourcePage === null)).toBe(true);
    expect(parsed.facts).toContainEqual(
      expect.objectContaining({
        key: 'surplus-proxy',
        value: 100,
        classification: 'surplus_proxy',
        extractionMode: 'manual',
        sourcePage: null,
        reviewStatus: 'approved'
      })
    );
    expect(parsed.assumptions).toMatchObject({
      contractorClassification: 'constant_capital',
      includeStockCompensation: false,
      includeNeedsReview: false
    });
    const calculator = new CalculationService();
    const facts = parsed.facts.map((fact) => ({
      key: fact.key,
      label: fact.label,
      value: fact.value,
      currency: fact.currency,
      scale: fact.scale,
      reportingPeriod: fact.reportingPeriod,
      classification: fact.classification,
      reviewStatus: fact.reviewStatus,
      verified: ['approved', 'reclassified'].includes(fact.reviewStatus),
      sensitivityCategory: fact.sensitivityCategory,
      sensitivityClassification: fact.sensitivityClassification
    }));
    expect(calculator.calculate(facts, parsed.assumptions)).toMatchObject({
      surplusValue: 400,
      evidenceCoverage: 100
    });
    expect(
      calculator.calculate(facts, { ...parsed.assumptions, includeSurplusProxy: true })
    ).toMatchObject({ surplusValue: 500, evidenceCoverage: 100 });
  });
});
