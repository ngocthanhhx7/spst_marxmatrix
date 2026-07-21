import type { ChatScope } from '@marxmatrix/contracts';

export const CHAT_PROVIDER = Symbol('CHAT_PROVIDER');

export type ChatImagePart = {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  bytes: Buffer;
};

export type ChatHistoryTurn = {
  role: 'user' | 'assistant';
  text: string;
  images: ChatImagePart[];
};

export type ChatModelInput = {
  text: string;
  history: ChatHistoryTurn[];
  images: ChatImagePart[];
};

export type ChatScopeDecision = { domain: ChatScope; confidence: number };
export type ChatApprovedScope = 'education' | 'finance' | 'mixed';

export type ChatCandidate = {
  answer: string;
  scope: ChatApprovedScope;
  model: string;
  promptVersion: string;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
};

export interface ChatProvider {
  classify(input: ChatModelInput, signal?: AbortSignal): Promise<ChatScopeDecision>;
  generate(
    input: ChatModelInput,
    approvedScope: ChatApprovedScope,
    signal?: AbortSignal
  ): Promise<ChatCandidate>;
  validateOutput(answer: string, approvedScope: ChatScope, signal?: AbortSignal): Promise<boolean>;
}
