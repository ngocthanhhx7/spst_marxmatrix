import type {
  ChatConversationDetail,
  ChatConversationSummary,
  ChatMessage,
  ChatScope,
  ChatStreamEvent,
  chatConversationListSchema
} from '@marxmatrix/contracts';
import type { z } from 'zod';

export type ChatConversationList = z.infer<typeof chatConversationListSchema>;

export type {
  ChatConversationDetail,
  ChatConversationSummary,
  ChatMessage,
  ChatScope,
  ChatStreamEvent
};

export type ChatMessageInput = { text: string; images: File[] };
