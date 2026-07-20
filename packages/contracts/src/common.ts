import { z } from 'zod';

export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Expected a MongoDB ObjectId.');
export const uuidSchema = z.uuid();
export const finiteNumberSchema = z.number().refine(Number.isFinite, 'Expected a finite number.');
export const isoDateTimeSchema = z.iso.datetime({ offset: true });

export const apiErrorSchema = z.object({
  statusCode: z.number().int().min(400).max(599),
  code: z.string().min(1).max(100),
  message: z.string().min(1).max(1000),
  details: z.array(z.unknown()).readonly(),
  requestId: uuidSchema
});

export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20)
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ObjectId = z.infer<typeof objectIdSchema>;
