import { z } from 'zod';
import { isoDateTimeSchema, objectIdSchema, uuidSchema } from './common.js';

export const CHAT_MAX_IMAGES = 4;
export const CHAT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const CHAT_MAX_MULTIPART_BYTES = 20 * 1024 * 1024;

export const chatScopeSchema = z.enum(['education', 'finance', 'mixed', 'ambiguous', 'out_of_scope']);
export const chatMessageStatusSchema = z.enum(['pending', 'completed', 'refused', 'failed', 'cancelled']);
export const chatReasonCodeSchema = z.enum(['scope_ambiguous', 'out_of_scope']).nullable();

export const chatMessageInputSchema = z
  .object({
    text: z.string().trim().max(8_000).default(''),
    imageCount: z.number().int().min(0).max(CHAT_MAX_IMAGES)
  })
  .refine(({ text, imageCount }) => text.length > 0 || imageCount > 0, {
    message: 'A message requires text or at least one image.'
  });

export const chatAttachmentSchema = z.object({
  id: objectIdSchema,
  originalFileName: z.string().min(1).max(255),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  byteSize: z.number().int().positive().max(CHAT_MAX_IMAGE_BYTES)
});

export const chatMessageSchema = z.object({
  id: objectIdSchema,
  conversationId: objectIdSchema,
  role: z.enum(['user', 'assistant']),
  text: z.string().max(20_000),
  attachments: z.array(chatAttachmentSchema).max(CHAT_MAX_IMAGES),
  status: chatMessageStatusSchema,
  scope: chatScopeSchema.nullable(),
  reasonCode: chatReasonCodeSchema,
  replyToMessageId: objectIdSchema.nullable(),
  createdAt: isoDateTimeSchema
});

export const chatConversationSummarySchema = z.object({
  id: objectIdSchema,
  title: z.string().min(1).max(80),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema
});

export const chatConversationDetailSchema = chatConversationSummarySchema.extend({
  messages: z.array(chatMessageSchema),
  nextCursor: z.string().min(1).max(256).nullable()
});

export const chatConversationListSchema = z.object({
  conversations: z.array(chatConversationSummarySchema),
  nextCursor: z.string().min(1).max(256).nullable()
});

export const chatCursorQuerySchema = z.object({
  cursor: z.string().min(1).max(256).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

const chatStreamProgressSchema = z.object({
  type: z.enum(['checking_scope', 'reading_images', 'generating']),
  runId: uuidSchema
});

const chatStreamTerminalSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('final'), runId: uuidSchema, message: chatMessageSchema }),
  z.object({ type: z.literal('refusal'), runId: uuidSchema, message: chatMessageSchema }),
  z.object({
    type: z.literal('error'),
    runId: uuidSchema,
    code: z.string().min(1).max(100),
    message: z.string().min(1).max(1_000)
  })
]);

export const chatStreamEventSchema = z.union([chatStreamProgressSchema, chatStreamTerminalSchema]);

export type ChatScope = z.infer<typeof chatScopeSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatConversationSummary = z.infer<typeof chatConversationSummarySchema>;
export type ChatConversationDetail = z.infer<typeof chatConversationDetailSchema>;
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;
