import {
  defaultScannerAssumptions,
  type ScannerAssumptions,
  type ScannerCalculationResult,
  type ScannerFact
} from './scanner-types.js';
import { ScannerDomainError } from './scanner-domain-error.js';

const calculateTotal = (
  facts: readonly ScannerFact[],
  classification: ScannerFact['classification']
) =>
  facts
    .filter((fact) => fact.classification === classification)
    .reduce((total, fact) => total + fact.value, 0);

export class CalculationService {
  public calculate(
    facts: readonly ScannerFact[],
    assumptions: ScannerAssumptions = defaultScannerAssumptions
  ): ScannerCalculationResult {
    this.assertFacts(facts);
    this.assertAssumptions(assumptions);
    const effectiveFacts = this.effectiveFacts(facts, assumptions);
    const negativeInput = effectiveFacts.find(
      (fact) =>
        ['revenue', 'constant_capital', 'variable_capital', 'surplus_proxy'].includes(
          fact.classification
        ) && fact.value < 0
    );
    if (negativeInput !== undefined)
      throw new ScannerDomainError(
        'NEGATIVE_CALCULATION_INPUT',
        `Calculation input ${negativeInput.key} must not be negative.`
      );
    const revenue = calculateTotal(effectiveFacts, 'revenue');
    const proxy = calculateTotal(effectiveFacts, 'surplus_proxy');
    const constantCapital = calculateTotal(effectiveFacts, 'constant_capital');
    const variableCapital = calculateTotal(effectiveFacts, 'variable_capital');
    const adjustedRevenue = (revenue + proxy) * assumptions.revenueAdjustment;
    const surplusValue = adjustedRevenue - constantCapital - variableCapital;
    const totalCapital = constantCapital + variableCapital;
    if (totalCapital <= 0)
      throw new ScannerDomainError(
        'ZERO_TOTAL_CAPITAL',
        'Total capital must be greater than zero.'
      );
    if (variableCapital <= 0)
      throw new ScannerDomainError(
        'ZERO_VARIABLE_CAPITAL',
        'Variable capital must be greater than zero.'
      );
    const usedFacts = effectiveFacts.filter((fact) =>
      ['revenue', 'constant_capital', 'variable_capital', 'surplus_proxy'].includes(
        fact.classification
      )
    );
    const usedValue = usedFacts.reduce((total, fact) => total + Math.abs(fact.value), 0);
    if (usedValue === 0)
      throw new ScannerDomainError(
        'ZERO_USED_VALUE',
        'Calculation inputs must have a non-zero value.'
      );
    const evidenceCoverage =
      (usedFacts
        .filter((fact) => fact.verified)
        .reduce((total, fact) => total + Math.abs(fact.value), 0) /
        usedValue) *
      100;
    const result = {
      constantCapital,
      variableCapital,
      adjustedRevenue,
      surplusValue,
      surplusValueRate: (surplusValue / variableCapital) * 100,
      organicComposition: constantCapital / variableCapital,
      profitRate: (surplusValue / totalCapital) * 100,
      evidenceCoverage
    };
    for (const [key, value] of Object.entries(result)) {
      if (!Number.isFinite(value))
        throw new ScannerDomainError(
          'NON_FINITE_RESULT',
          `Calculation result ${key} is not finite.`
        );
    }
    return result;
  }

  private assertFacts(facts: readonly ScannerFact[]): void {
    if (facts.length === 0)
      throw new ScannerDomainError('EMPTY_FACTS', 'At least one financial fact is required.');
    const currencies = new Set<string>();
    const periods = new Set<string>();
    const scales = new Set<string>();
    for (const fact of facts) {
      if (!Number.isFinite(fact.value))
        throw new ScannerDomainError(
          'NON_FINITE_FACT_VALUE',
          `Fact ${fact.key} must have a finite value.`
        );
      currencies.add(fact.currency);
      periods.add(fact.reportingPeriod);
      scales.add(fact.scale);
    }
    if (currencies.size > 1)
      throw new ScannerDomainError('MIXED_CURRENCY', 'All facts must share one currency.');
    if (periods.size > 1)
      throw new ScannerDomainError(
        'MIXED_REPORTING_PERIOD',
        'All facts must share one reporting period.'
      );
    if (scales.size > 1)
      throw new ScannerDomainError('MIXED_SCALE', 'All facts must share one scale.');
  }

  private assertAssumptions(assumptions: ScannerAssumptions): void {
    if (!Number.isFinite(assumptions.revenueAdjustment))
      throw new ScannerDomainError('NON_FINITE_ASSUMPTION', 'Revenue adjustment must be finite.');
    if (assumptions.revenueAdjustment < 0 || assumptions.revenueAdjustment > 1)
      throw new ScannerDomainError(
        'INVALID_REVENUE_ADJUSTMENT',
        'Revenue adjustment must be between zero and one.'
      );
    if (
      assumptions.contractorClassification !== 'constant_capital' &&
      assumptions.contractorClassification !== 'variable_capital'
    )
      throw new ScannerDomainError(
        'INVALID_CONTRACTOR_CLASSIFICATION',
        'Contractor classification must be constant or variable capital.'
      );
    if (
      typeof assumptions.includeSurplusProxy !== 'boolean' ||
      typeof assumptions.includeStockCompensation !== 'boolean' ||
      typeof assumptions.includeNeedsReview !== 'boolean'
    )
      throw new ScannerDomainError(
        'INVALID_POLICY',
        'Sensitivity policy switches must be boolean.'
      );
  }
  private effectiveFacts(
    facts: readonly ScannerFact[],
    assumptions: ScannerAssumptions
  ): ScannerFact[] {
    return facts.map((fact) => {
      if (fact.reviewStatus === 'rejected') return { ...fact, classification: 'excluded' };

      let classification = fact.classification;
      if (fact.reviewStatus === 'pending_review' || classification === 'needs_review') {
        if (!assumptions.includeNeedsReview) return { ...fact, classification: 'excluded' };
        else if (fact.sensitivityClassification !== null)
          classification = fact.sensitivityClassification;
        else if (classification === 'needs_review') classification = 'excluded';
      }

      if (fact.sensitivityCategory === 'contractor')
        classification = assumptions.contractorClassification;
      if (fact.sensitivityCategory === 'stock_compensation')
        classification = assumptions.includeStockCompensation ? 'variable_capital' : 'excluded';
      if (classification === 'surplus_proxy' && !assumptions.includeSurplusProxy)
        classification = 'excluded';

      return { ...fact, classification };
    });
  }
}
