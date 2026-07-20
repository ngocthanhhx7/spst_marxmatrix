import { z } from 'zod';
import { finiteNumberSchema, objectIdSchema } from './common.js';

export const financialClassificationSchema = z.enum([
  'revenue',
  'constant_capital',
  'variable_capital',
  'surplus_proxy',
  'excluded',
  'needs_review'
]);
export const reviewStatusSchema = z.enum([
  'pending_review',
  'approved',
  'rejected',
  'reclassified'
]);
export const extractionModeSchema = z.enum(['manual', 'ai_extracted', 'imported']);
export const scaleSchema = z.enum(['ones', 'thousands', 'millions', 'billions']);
export const sensitivityCategorySchema = z.enum(['standard', 'contractor', 'stock_compensation']);
export const sensitivityClassificationSchema = z.enum([
  'revenue',
  'constant_capital',
  'variable_capital',
  'surplus_proxy',
  'excluded'
]);
export const financialFactSchema = z.object({
  key: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(250),
  value: finiteNumberSchema,
  currency: z.string().trim().length(3).toUpperCase(),
  scale: scaleSchema,
  reportingPeriod: z.string().trim().min(1).max(100),
  classification: financialClassificationSchema,
  extractionMode: extractionModeSchema,
  sourcePage: z.number().int().min(1).nullable(),
  sourceChunkId: objectIdSchema.nullable(),
  evidenceText: z.string().max(5000).nullable(),
  classificationReason: z.string().trim().min(1).max(1000),
  reviewStatus: reviewStatusSchema,
  sensitivityCategory: sensitivityCategorySchema.default('standard'),
  sensitivityClassification: sensitivityClassificationSchema.nullable().default(null)
});
export const storedFinancialFactSchema = financialFactSchema.extend({ id: objectIdSchema });
export const analysisAssumptionsSchema = z.object({
  revenueAdjustment: finiteNumberSchema.min(0).max(1).default(1),
  includeSurplusProxy: z.boolean().default(false),
  contractorClassification: z
    .enum(['constant_capital', 'variable_capital'])
    .default('constant_capital'),
  includeStockCompensation: z.boolean().default(false),
  includeNeedsReview: z.boolean().default(false),
  notes: z.string().max(2000).default('')
});
export const updateAnalysisAssumptionsSchema = z.object({
  revenueAdjustment: finiteNumberSchema.min(0).max(1),
  includeSurplusProxy: z.boolean(),
  contractorClassification: z.enum(['constant_capital', 'variable_capital']),
  includeStockCompensation: z.boolean(),
  includeNeedsReview: z.boolean(),
  notes: z.string().max(2000)
});
export const createAnalysisInputSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    facts: z.array(financialFactSchema).min(1).max(200),
    assumptions: analysisAssumptionsSchema.default({
      revenueAdjustment: 1,
      includeSurplusProxy: false,
      contractorClassification: 'constant_capital',
      includeStockCompensation: false,
      includeNeedsReview: false,
      notes: ''
    })
  })
  .refine((input) => input.facts.every((fact) => fact.extractionMode === 'manual'), {
    path: ['facts'],
    message: 'Manual analysis creation accepts only manually entered facts.'
  });
export const scannerManualFormSchema = z.object({
  title: z.string().trim().min(3).max(200),
  currency: z.string().trim().length(3).toUpperCase(),
  reportingPeriod: z.string().trim().min(1).max(100),
  scale: scaleSchema,
  revenue: finiteNumberSchema.min(0),
  constantCapital: finiteNumberSchema.min(0),
  variableCapital: finiteNumberSchema.positive(),
  contractorAmount: finiteNumberSchema.min(0),
  stockCompensationAmount: finiteNumberSchema.min(0),
  needsReviewAmount: finiteNumberSchema.min(0),
  needsReviewClassification: sensitivityClassificationSchema,
  revenueAdjustment: finiteNumberSchema.min(0).max(1),
  includeSurplusProxy: z.boolean(),
  contractorClassification: z.enum(['constant_capital', 'variable_capital']),
  includeStockCompensation: z.boolean(),
  includeNeedsReview: z.boolean()
});
export const updateAnalysisFactInputSchema = z
  .object({
    classification: financialClassificationSchema.optional(),
    classificationReason: z.string().trim().min(1).max(1000).optional(),
    reviewStatus: reviewStatusSchema.optional(),
    sensitivityCategory: sensitivityCategorySchema.optional(),
    sensitivityClassification: sensitivityClassificationSchema.nullable().optional()
  })
  .refine((input) => Object.keys(input).length > 0, 'At least one fact field is required.');
export const calculationResultSchema = z.object({
  constantCapital: finiteNumberSchema,
  variableCapital: finiteNumberSchema,
  adjustedRevenue: finiteNumberSchema,
  surplusValue: finiteNumberSchema,
  surplusValueRate: finiteNumberSchema.nullable(),
  organicComposition: finiteNumberSchema.nullable(),
  profitRate: finiteNumberSchema.nullable(),
  evidenceCoverage: finiteNumberSchema.min(0).max(100)
});
export const calculationVersionSchema = z.object({
  id: objectIdSchema,
  version: z.number().int().min(1),
  createdAt: z.iso.datetime({ offset: true }),
  assumptions: analysisAssumptionsSchema,
  result: calculationResultSchema
});
export const analysisListItemSchema = z.object({
  id: objectIdSchema,
  title: z.string().min(1).max(200),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true })
});
export const analysisDetailSchema = analysisListItemSchema.extend({
  finalized: z.boolean(),
  facts: z.array(storedFinancialFactSchema),
  assumptions: analysisAssumptionsSchema,
  calculationVersions: z.array(calculationVersionSchema)
});
export type FinancialFact = z.infer<typeof financialFactSchema>;
export type StoredFinancialFact = z.infer<typeof storedFinancialFactSchema>;
export type CreateAnalysisInput = z.infer<typeof createAnalysisInputSchema>;
export type AnalysisDetail = z.infer<typeof analysisDetailSchema>;
export type AnalysisListItem = z.infer<typeof analysisListItemSchema>;
export type UpdateAnalysisFactInput = z.infer<typeof updateAnalysisFactInputSchema>;
export type ScannerManualForm = z.infer<typeof scannerManualFormSchema>;
