import { z } from 'zod';
import { isoDateTimeSchema, objectIdSchema } from './common.js';

export const documentTypeSchema = z.enum(['financial_report', 'textbook']);
export const documentStatusSchema = z.enum([
  'uploaded',
  'parsing',
  'parsed',
  'embedding',
  'ready',
  'failed'
]);
export const documentMetadataSchema = z.object({
  id: objectIdSchema,
  title: z.string().min(1).max(300),
  type: documentTypeSchema,
  status: documentStatusSchema,
  mimeType: z.literal('application/pdf'),
  originalFileName: z.string().min(1).max(255),
  byteSize: z.number().int().nonnegative(),
  checksum: z.string().regex(/^[a-f\d]{64}$/i),
  pageCount: z.number().int().min(0),
  errorCode: z.string().min(1).max(100).nullable(),
  errorMessage: z.string().min(1).max(1000).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});
export const createDocumentMetadataSchema = z.object({
  title: z.string().trim().min(1).max(300),
  type: documentTypeSchema
});
export const documentPageSchema = z.object({
  documentId: objectIdSchema,
  pageNumber: z.number().int().min(1),
  text: z.string(),
  sourceChunkIds: z.array(objectIdSchema)
});
export type DocumentMetadata = z.infer<typeof documentMetadataSchema>;
export type DocumentPage = z.infer<typeof documentPageSchema>;
export type CreateDocumentMetadata = z.infer<typeof createDocumentMetadataSchema>;
export type DocumentType = z.infer<typeof documentTypeSchema>;
export type DocumentStatus = z.infer<typeof documentStatusSchema>;
