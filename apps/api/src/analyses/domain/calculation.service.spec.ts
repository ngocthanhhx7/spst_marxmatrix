import { describe, expect, it } from 'vitest';
import { CalculationService } from './calculation.service.js';
import { ScannerDomainError } from './scanner-domain-error.js';
import { defaultScannerAssumptions, type ScannerFact } from './scanner-types.js';

const fact = (overrides: Partial<ScannerFact>): ScannerFact => ({
  key: 'revenue',
  label: 'Doanh thu',
  value: 1_000,
  currency: 'USD',
  scale: 'millions',
  reportingPeriod: 'FY2025',
  classification: 'revenue',
  reviewStatus: 'approved',
  verified: true,
  sensitivityCategory: 'standard',
  sensitivityClassification: null,
  ...overrides
});

describe('CalculationService', () => {
  const calculator = new CalculationService();

  it('calculates Marxian metrics and percentage evidence coverage deterministically', () => {
    const result = calculator.calculate([
      fact({ key: 'revenue', value: 1_000, classification: 'revenue' }),
      fact({ key: 'infrastructure', value: 400, classification: 'constant_capital' }),
      fact({ key: 'labour', value: 200, classification: 'variable_capital' })
    ]);

    expect(result).toEqual({
      constantCapital: 400,
      variableCapital: 200,
      adjustedRevenue: 1_000,
      surplusValue: 400,
      surplusValueRate: 200,
      organicComposition: 2,
      profitRate: 66.66666666666666,
      evidenceCoverage: 100
    });
  });

  it('applies a revenue sensitivity assumption without changing capital inputs', () => {
    const result = calculator.calculate(
      [
        fact({ key: 'revenue', value: 1_000, classification: 'revenue' }),
        fact({ key: 'c', value: 400, classification: 'constant_capital' }),
        fact({ key: 'v', value: 200, classification: 'variable_capital' })
      ],
      { ...defaultScannerAssumptions, revenueAdjustment: 0.9 }
    );
    expect(result.adjustedRevenue).toBe(900);
    expect(result.surplusValue).toBe(300);
    expect(result.profitRate).toBe(50);
  });

  it('uses only verified calculation inputs for evidence coverage', () => {
    const result = calculator.calculate([
      fact({ key: 'revenue', value: 1_000, classification: 'revenue', verified: true }),
      fact({ key: 'c', value: 400, classification: 'constant_capital', verified: false }),
      fact({ key: 'v', value: 200, classification: 'variable_capital', verified: true })
    ]);
    expect(result.evidenceCoverage).toBeCloseTo(75);
  });

  it('counts a selected surplus proxy in both calculation and evidence coverage', () => {
    const result = calculator.calculate(
      [
        fact({ key: 'revenue', value: 1000, classification: 'revenue' }),
        fact({ key: 'c', value: 400, classification: 'constant_capital' }),
        fact({ key: 'v', value: 200, classification: 'variable_capital' }),
        fact({ key: 'proxy', value: 100, classification: 'surplus_proxy', verified: false })
      ],
      { ...defaultScannerAssumptions, includeSurplusProxy: true }
    );
    expect(result.surplusValue).toBe(500);
    expect(result.evidenceCoverage).toBeCloseTo((1600 / 1700) * 100);
  });

  it('applies contractor, stock-compensation and needs-review policies deterministically', () => {
    const facts = [
      fact({ key: 'revenue', value: 1000, classification: 'revenue' }),
      fact({ key: 'c', value: 400, classification: 'constant_capital' }),
      fact({ key: 'v', value: 100, classification: 'variable_capital' }),
      fact({ key: 'contractor', value: 100, sensitivityCategory: 'contractor' }),
      fact({ key: 'stock', value: 50, sensitivityCategory: 'stock_compensation' }),
      fact({
        key: 'review',
        value: 50,
        classification: 'needs_review',
        reviewStatus: 'pending_review',
        sensitivityClassification: 'variable_capital'
      })
    ];
    const base = calculator.calculate(facts, defaultScannerAssumptions);
    const included = calculator.calculate(facts, {
      ...defaultScannerAssumptions,
      contractorClassification: 'variable_capital',
      includeStockCompensation: true,
      includeNeedsReview: true
    });
    expect(base.variableCapital).toBe(100);
    expect(included.variableCapital).toBe(300);
    expect(
      calculator.calculate(facts, {
        ...defaultScannerAssumptions,
        contractorClassification: 'variable_capital',
        includeStockCompensation: true,
        includeNeedsReview: true
      })
    ).toEqual(included);
  });

  it('applies sensitivity policies to exact UI-shaped excluded facts', () => {
    const baseFacts = [
      fact({ key: 'revenue', value: 1000, classification: 'revenue' }),
      fact({ key: 'c', value: 400, classification: 'constant_capital' }),
      fact({ key: 'v', value: 200, classification: 'variable_capital' })
    ];
    const contractor = fact({
      key: 'contractor',
      value: 100,
      classification: 'excluded',
      sensitivityCategory: 'contractor'
    });
    const stock = fact({
      key: 'stock',
      value: 100,
      classification: 'excluded',
      sensitivityCategory: 'stock_compensation'
    });

    expect(calculator.calculate([...baseFacts, contractor]).constantCapital).toBe(500);
    expect(
      calculator.calculate([...baseFacts, contractor], {
        ...defaultScannerAssumptions,
        contractorClassification: 'variable_capital'
      }).variableCapital
    ).toBe(300);
    expect(calculator.calculate([...baseFacts, stock]).variableCapital).toBe(200);
    expect(
      calculator.calculate([...baseFacts, stock], {
        ...defaultScannerAssumptions,
        includeStockCompensation: true
      }).variableCapital
    ).toBe(300);
  });

  it('gates needs_review classification even when an incoherent client marks it approved', () => {
    const inputs = [
      fact({ key: 'revenue', value: 1000, classification: 'revenue' }),
      fact({ key: 'c', value: 400, classification: 'constant_capital' }),
      fact({ key: 'v', value: 200, classification: 'variable_capital' }),
      fact({
        key: 'review',
        value: 100,
        classification: 'needs_review',
        reviewStatus: 'approved',
        sensitivityClassification: 'variable_capital'
      })
    ];

    expect(calculator.calculate(inputs).variableCapital).toBe(200);
    expect(
      calculator.calculate(inputs, {
        ...defaultScannerAssumptions,
        includeNeedsReview: true
      }).variableCapital
    ).toBe(300);
  });

  it('never re-enables a rejected sensitivity fact', () => {
    const result = calculator.calculate(
      [
        fact({ key: 'revenue', value: 1000, classification: 'revenue' }),
        fact({ key: 'c', value: 400, classification: 'constant_capital' }),
        fact({ key: 'v', value: 200, classification: 'variable_capital' }),
        fact({
          key: 'rejected-contractor',
          value: 100,
          classification: 'excluded',
          reviewStatus: 'rejected',
          sensitivityCategory: 'contractor'
        })
      ],
      { ...defaultScannerAssumptions, contractorClassification: 'variable_capital' }
    );

    expect(result.variableCapital).toBe(200);
  });

  it('does not include a needs-review surplus proxy when surplus proxies are disabled', () => {
    const result = calculator.calculate(
      [
        fact({ key: 'revenue', value: 1000, classification: 'revenue' }),
        fact({ key: 'c', value: 400, classification: 'constant_capital' }),
        fact({ key: 'v', value: 200, classification: 'variable_capital' }),
        fact({
          key: 'review-proxy',
          value: 100,
          classification: 'needs_review',
          reviewStatus: 'pending_review',
          sensitivityClassification: 'surplus_proxy'
        })
      ],
      { ...defaultScannerAssumptions, includeNeedsReview: true, includeSurplusProxy: false }
    );

    expect(result.adjustedRevenue).toBe(1000);
    expect(result.surplusValue).toBe(400);
  });

  it.each([
    ['rejected', 'rejected' as const, true, 200],
    ['pending review excluded by default', 'pending_review' as const, false, 200],
    ['pending review explicitly included', 'pending_review' as const, true, 300],
    ['approved', 'approved' as const, false, 300],
    ['reclassified', 'reclassified' as const, false, 300]
  ])(
    'applies review status policy for %s facts',
    (_name, reviewStatus, includeNeedsReview, expectedVariableCapital) => {
      const result = calculator.calculate(
        [
          fact({ key: 'revenue', value: 1000, classification: 'revenue' }),
          fact({ key: 'c', value: 400, classification: 'constant_capital' }),
          fact({ key: 'v', value: 200, classification: 'variable_capital' }),
          fact({
            key: 'review',
            value: 100,
            classification: reviewStatus === 'pending_review' ? 'needs_review' : 'variable_capital',
            reviewStatus,
            sensitivityClassification: 'variable_capital'
          })
        ],
        { ...defaultScannerAssumptions, includeNeedsReview }
      );

      expect(result.variableCapital).toBe(expectedVariableCapital);
    }
  );

  it.each([
    [
      'contractor c/v policy',
      { contractorClassification: 'variable_capital' as const },
      fact({ key: 'contractor', value: 100, sensitivityCategory: 'contractor' }),
      300
    ],
    [
      'stock compensation policy',
      { includeStockCompensation: true },
      fact({ key: 'stock', value: 100, sensitivityCategory: 'stock_compensation' }),
      300
    ],
    [
      'needs-review policy',
      { includeNeedsReview: true },
      fact({
        key: 'review',
        value: 100,
        classification: 'needs_review',
        reviewStatus: 'pending_review',
        sensitivityClassification: 'variable_capital'
      }),
      300
    ] as const
  ])('changes deterministic calculation for %s', (_name, policy, policyFact, expected) => {
    const inputs = [
      fact({ key: 'revenue', value: 1000, classification: 'revenue' }),
      fact({ key: 'c', value: 400, classification: 'constant_capital' }),
      fact({ key: 'v', value: 200, classification: 'variable_capital' }),
      policyFact
    ];
    const excluded = calculator.calculate(inputs, defaultScannerAssumptions);
    const included = calculator.calculate(inputs, { ...defaultScannerAssumptions, ...policy });
    expect(excluded.variableCapital).toBe(200);
    expect(included.variableCapital).toBe(expected);
  });

  it.each([
    [[fact({ currency: 'USD' }), fact({ key: 'other', currency: 'VND' })], 'MIXED_CURRENCY'],
    [
      [fact({ reportingPeriod: 'FY2025' }), fact({ key: 'other', reportingPeriod: 'Q1 2025' })],
      'MIXED_REPORTING_PERIOD'
    ],
    [[fact({ scale: 'millions' }), fact({ key: 'other', scale: 'thousands' })], 'MIXED_SCALE'],
    [[fact({ key: 'revenue', value: Number.NaN })], 'NON_FINITE_FACT_VALUE'],
    [[fact({ key: 'revenue', value: Number.POSITIVE_INFINITY })], 'NON_FINITE_FACT_VALUE'],
    [[fact({ key: 'revenue', value: Number.NEGATIVE_INFINITY })], 'NON_FINITE_FACT_VALUE']
  ] as const)('rejects incompatible or non-finite facts with %s', (facts, code) => {
    expect(() => calculator.calculate(facts)).toThrow(expect.objectContaining({ code }));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite assumptions (%s)',
    (revenueAdjustment) => {
      expect(() =>
        calculator.calculate(
          [
            fact({ key: 'revenue', value: 1000, classification: 'revenue' }),
            fact({ key: 'c', value: 400, classification: 'constant_capital' }),
            fact({ key: 'v', value: 200, classification: 'variable_capital' })
          ],
          { ...defaultScannerAssumptions, revenueAdjustment }
        )
      ).toThrow(expect.objectContaining({ code: 'NON_FINITE_ASSUMPTION' }));
    }
  );

  it('rejects zero denominators instead of returning NaN or infinity', () => {
    expect(() =>
      calculator.calculate([
        fact({ key: 'revenue', value: 100, classification: 'revenue' }),
        fact({ key: 'c', value: 100, classification: 'constant_capital' }),
        fact({ key: 'v', value: 0, classification: 'variable_capital' })
      ])
    ).toThrow(ScannerDomainError);
    expect(() =>
      calculator.calculate([
        fact({ key: 'revenue', value: 0, classification: 'revenue' }),
        fact({ key: 'c', value: 0, classification: 'constant_capital' }),
        fact({ key: 'v', value: 0, classification: 'variable_capital' })
      ])
    ).toThrow(expect.objectContaining({ code: 'ZERO_TOTAL_CAPITAL' }));
  });

  it.each([
    ['effective revenue', fact({ key: 'revenue', value: -1, classification: 'revenue' })],
    [
      'effective constant capital',
      fact({ key: 'c', value: -1, classification: 'constant_capital' })
    ],
    [
      'effective variable capital',
      fact({ key: 'v', value: -1, classification: 'variable_capital' })
    ],
    ['effective surplus proxy', fact({ key: 'proxy', value: -1, classification: 'surplus_proxy' })]
  ])('rejects a negative %s input', (_name, negativeFact) => {
    expect(() =>
      calculator.calculate(
        [
          fact({ key: 'revenue', value: 1000, classification: 'revenue' }),
          fact({ key: 'c', value: 400, classification: 'constant_capital' }),
          fact({ key: 'v', value: 200, classification: 'variable_capital' }),
          negativeFact
        ],
        { ...defaultScannerAssumptions, includeSurplusProxy: true }
      )
    ).toThrow(expect.objectContaining({ code: 'NEGATIVE_CALCULATION_INPUT' }));
  });

  it('rejects non-positive effective denominators even when opposing inputs cancel', () => {
    expect(() =>
      calculator.calculate([
        fact({ key: 'revenue', value: 100, classification: 'revenue' }),
        fact({ key: 'c-positive', value: 100, classification: 'constant_capital' }),
        fact({ key: 'c-negative', value: -100, classification: 'constant_capital' }),
        fact({ key: 'v', value: 0, classification: 'variable_capital' })
      ])
    ).toThrow(expect.objectContaining({ code: 'NEGATIVE_CALCULATION_INPUT' }));
  });
});
