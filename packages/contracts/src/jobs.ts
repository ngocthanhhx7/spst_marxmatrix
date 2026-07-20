import { z } from 'zod';
import { isoDateTimeSchema, objectIdSchema } from './common.js';

export const jobTypeSchema = z.enum([
  'parse_pdf',
  'extract_financials',
  'embed_document',
  'rebuild_document_index'
]);
export const jobStatusSchema = z.enum(['queued', 'leased', 'completed', 'failed', 'cancelled']);
export const documentOnlyJobPayloadSchema = z
  .object({
    documentId: objectIdSchema
  })
  .strict();
export const financialExtractionPayloadSchema = z
  .object({ documentId: objectIdSchema, analysisId: objectIdSchema })
  .strict();

/** Payload schemas are deliberately selected from this allow-list by job type. */
export const jobPayloadByTypeSchema = {
  parse_pdf: documentOnlyJobPayloadSchema,
  extract_financials: financialExtractionPayloadSchema,
  embed_document: documentOnlyJobPayloadSchema,
  rebuild_document_index: documentOnlyJobPayloadSchema
} as const satisfies Record<JobType, z.ZodType>;

export function jobPayloadForTypeSchema<T extends JobType>(type: T) {
  return jobPayloadByTypeSchema[type];
}

export const jobPayloadSchema = z.union([
  documentOnlyJobPayloadSchema,
  financialExtractionPayloadSchema
]);
export const jobSchema = z.object({
  id: objectIdSchema,
  type: jobTypeSchema,
  status: jobStatusSchema,
  payload: jobPayloadSchema,
  idempotencyKey: z.string().min(1).max(200),
  attempts: z.number().int().min(0),
  maxAttempts: z.number().int().min(1).max(20),
  runAt: isoDateTimeSchema,
  lockedBy: z.string().min(1).max(200).nullable(),
  lockedUntil: isoDateTimeSchema.nullable(),
  errorCode: z.string().min(1).max(100).nullable(),
  errorMessage: z.string().min(1).max(1000).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});
export type Job = z.infer<typeof jobSchema>;
export type JobPayload = z.infer<typeof jobPayloadSchema>;
export type JobPayloadInput = z.input<typeof jobPayloadSchema>;
export type JobType = z.infer<typeof jobTypeSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
