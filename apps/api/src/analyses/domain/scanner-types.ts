export type ScannerClassification =
  | 'revenue'
  | 'constant_capital'
  | 'variable_capital'
  | 'surplus_proxy'
  | 'excluded'
  | 'needs_review';

export interface ScannerFact {
  key: string;
  label: string;
  value: number;
  currency: string;
  scale: 'ones' | 'thousands' | 'millions' | 'billions';
  reportingPeriod: string;
  classification: ScannerClassification;
  reviewStatus: 'pending_review' | 'approved' | 'rejected' | 'reclassified';
  verified: boolean;
  sensitivityCategory: 'standard' | 'contractor' | 'stock_compensation';
  sensitivityClassification: Exclude<ScannerClassification, 'needs_review'> | null;
}

export interface ScannerAssumptions {
  revenueAdjustment: number;
  includeSurplusProxy: boolean;
  contractorClassification: 'constant_capital' | 'variable_capital';
  includeStockCompensation: boolean;
  includeNeedsReview: boolean;
  notes: string;
}

export interface ScannerCalculationResult {
  constantCapital: number;
  variableCapital: number;
  adjustedRevenue: number;
  surplusValue: number;
  surplusValueRate: number;
  organicComposition: number;
  profitRate: number;
  evidenceCoverage: number;
}

export const defaultScannerAssumptions: ScannerAssumptions = {
  revenueAdjustment: 1,
  includeSurplusProxy: false,
  contractorClassification: 'constant_capital',
  includeStockCompensation: false,
  includeNeedsReview: false,
  notes: ''
};
