import { z } from 'zod';
import { objectIdSchema } from './common.js';
import { financialFactSchema, reviewStatusSchema } from './scanner.js';

export const financialExtractionInputSchema = z.object({
  documentId: objectIdSchema,
  pageNumbers: z.array(z.number().int().min(1)).min(1),
  chunks: z
    .array(
      z.object({
        sourcePage: z.number().int().min(1),
        sourceChunkId: objectIdSchema,
        text: z.string().trim().min(1).max(12_000)
      })
    )
    .min(1)
});
export const aiExtractedFinancialFactSchema = financialFactSchema.extend({
  extractionMode: z.literal('ai_extracted'),
  reviewStatus: z.literal('pending_review'),
  sourcePage: z.number().int().min(1),
  sourceChunkId: objectIdSchema,
  evidenceText: z.string().trim().min(1)
});
export const aiUsageSchema = z
  .object({
    inputTokens: z.number().int().nonnegative().optional(),
    outputTokens: z.number().int().nonnegative().optional(),
    totalTokens: z.number().int().nonnegative().optional()
  })
  .strict();
export const financialExtractionResultSchema = z.object({
  facts: z.array(aiExtractedFinancialFactSchema),
  simulated: z.boolean(),
  model: z.string().min(1),
  promptVersion: z.string().min(1),
  usage: aiUsageSchema.optional()
});
export const queueFinancialExtractionInputSchema = z
  .object({ analysisId: objectIdSchema })
  .strict();
export const queueFinancialExtractionResultSchema = z.object({
  status: z.enum(['queued', 'already-complete']),
  documentId: objectIdSchema,
  analysisId: objectIdSchema
});
export const documentExtractionFactSchema = aiExtractedFinancialFactSchema
  .pick({
    label: true,
    value: true,
    currency: true,
    scale: true,
    reportingPeriod: true,
    classification: true,
    reviewStatus: true,
    sourcePage: true,
    evidenceText: true
  })
  .extend({ id: objectIdSchema, reviewStatus: reviewStatusSchema });
export const documentExtractionEnvelopeSchema = z.object({
  facts: z.array(documentExtractionFactSchema),
  simulated: z.boolean().nullable(),
  model: z.string().min(1).nullable(),
  promptVersion: z.string().min(1).nullable(),
  usage: aiUsageSchema.nullable()
});
export type FinancialExtractionInput = z.infer<typeof financialExtractionInputSchema>;
export type FinancialExtractionResult = z.infer<typeof financialExtractionResultSchema>;
export type QueueFinancialExtractionInput = z.infer<typeof queueFinancialExtractionInputSchema>;
export type QueueFinancialExtractionResult = z.infer<typeof queueFinancialExtractionResultSchema>;
export type DocumentExtractionEnvelope = z.infer<typeof documentExtractionEnvelopeSchema>;
export const embeddingInputSchema = z.object({
  chunks: z.array(z.object({ id: objectIdSchema, text: z.string().min(1).max(12000) })).min(1)
});
export const embeddingResultSchema = z.object({
  embeddings: z.array(
    z.object({ chunkId: objectIdSchema, values: z.array(z.number().finite()).min(1) })
  ),
  simulated: z.boolean(),
  model: z.string().min(1)
});
export const groundedGenerationInputSchema = z.object({
  query: z.string().trim().min(1).max(2000),
  retrievedChunkIds: z.array(objectIdSchema).min(1)
});
export const groundedGenerationResultSchema = z.object({
  answer: z.string().min(1),
  simulated: z.boolean()
});
