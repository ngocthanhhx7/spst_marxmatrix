import { z } from 'zod';
import { objectIdSchema } from './common.js';

export const courseIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{2,12}\d{2,6}$/);
/** Server-owned corpus key for documents uploaded by an individual Copilot user. */
export const PERSONAL_COPILOT_COURSE_ID = 'COPILOT01' as const;
/** One embedding space shared by persisted chunks and every retrieval adapter. */
export const RAG_EMBEDDING_DIMENSION = 768;
export const ragModeSchema = z.enum(['query', 'outline', 'comparison', 'critique']);
export const ragQuerySchema = z.object({
  courseId: courseIdSchema,
  documentIds: z.array(objectIdSchema).min(1).max(10),
  mode: ragModeSchema,
  question: z.string().trim().min(3).max(2_000)
});
/** The owner is derived from the authenticated session; callers cannot select a corpus. */
export const copilotQuerySchema = z.object({
  documentIds: z.array(objectIdSchema).min(1).max(10),
  mode: ragModeSchema,
  question: z.string().trim().min(3).max(2_000)
});
export const ragCourseDocumentSchema = z.object({
  id: objectIdSchema,
  title: z.string().min(1).max(300),
  pageCount: z.number().int().positive()
});
export const retrievedChunkSchema = z
  .object({
    id: objectIdSchema,
    courseId: courseIdSchema,
    documentId: objectIdSchema,
    parseToken: z.string().min(1).max(100),
    pageStart: z.number().int().min(1),
    pageEnd: z.number().int().min(1),
    text: z.string().min(1),
    score: z.number().finite()
  })
  .refine((chunk) => chunk.pageEnd >= chunk.pageStart, {
    message: 'pageEnd must not precede pageStart.'
  });
export const citationSchema = z
  .object({
    chunkId: objectIdSchema,
    documentId: objectIdSchema,
    pageStart: z.number().int().min(1),
    pageEnd: z.number().int().min(1),
    quote: z.string().min(1).max(2000)
  })
  .refine((citation) => citation.pageEnd >= citation.pageStart, {
    message: 'pageEnd must not precede pageStart.'
  });
export const ragChunkSchema = z
  .object({
    id: objectIdSchema,
    ownerId: objectIdSchema,
    courseId: courseIdSchema,
    documentId: objectIdSchema,
    parseToken: z.string().min(1).max(100),
    pageStart: z.number().int().min(1),
    pageEnd: z.number().int().min(1),
    text: z.string().min(1),
    checksum: z.string().regex(/^[a-f\d]{64}$/i),
    embedding: z.array(z.number().finite()).length(RAG_EMBEDDING_DIMENSION)
  })
  .refine((chunk) => chunk.pageEnd >= chunk.pageStart, {
    message: 'pageEnd must not precede pageStart.'
  });
export const ragClaimSchema = z.object({
  text: z.string().min(1).max(4000),
  citationIndexes: z.array(z.number().int().min(0)).min(1)
});
export const ragResponseSchema = z
  .object({
    mode: ragModeSchema,
    answer: z.string().min(1),
    simulated: z.boolean(),
    claims: z.array(ragClaimSchema),
    citations: z.array(citationSchema),
    warning: z.string().min(1).nullable()
  })
  .superRefine((response, context) => {
    if (
      response.claims.length === 0 &&
      response.citations.length === 0 &&
      response.warning === null
    )
      context.addIssue({
        code: 'custom',
        path: ['warning'],
        message: 'A warning is required when no grounded claims are available.'
      });
    if (response.claims.length > 0 && response.citations.length === 0)
      context.addIssue({
        code: 'custom',
        path: ['citations'],
        message: 'Claims require citations.'
      });
    if (response.claims.length === 0 && response.citations.length > 0)
      context.addIssue({
        code: 'custom',
        path: ['claims'],
        message: 'Citations require at least one grounded claim.'
      });
    response.claims.forEach((claim, claimIndex) => {
      claim.citationIndexes.forEach((citationIndex, citationIndexPosition) => {
        if (citationIndex >= response.citations.length) {
          context.addIssue({
            code: 'custom',
            path: ['claims', claimIndex, 'citationIndexes', citationIndexPosition],
            message: 'Citation index must reference a citation in this response.'
          });
        }
      });
    });
  });

export type CourseId = z.infer<typeof courseIdSchema>;
export type RagQuery = z.infer<typeof ragQuerySchema>;
export type CopilotQuery = z.infer<typeof copilotQuerySchema>;
export type RagCourseDocument = z.infer<typeof ragCourseDocumentSchema>;
export type RagChunk = z.infer<typeof ragChunkSchema>;
export type RetrievedChunk = z.infer<typeof retrievedChunkSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type RagResponse = z.infer<typeof ragResponseSchema>;
