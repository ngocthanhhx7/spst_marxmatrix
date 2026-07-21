import { chatStreamEventSchema } from '@marxmatrix/contracts';
import { ApiError } from '../../shared/api/api-error.js';
import { apiClient } from '../../shared/api/runtime.js';
import type {
  ChatConversationDetail,
  ChatConversationList,
  ChatConversationSummary,
  ChatMessageInput,
  ChatStreamEvent
} from './chat.types.js';

const terminalTypes = new Set<ChatStreamEvent['type']>(['final', 'refusal', 'error']);

function invalidStream(): ApiError {
  return new ApiError(502, 'CHAT_AI_RESPONSE_INVALID', 'Chat AI returned an invalid response.');
}

function cursorPath(path: string, cursor?: string): string {
  return cursor === undefined ? path : `${path}?cursor=${encodeURIComponent(cursor)}`;
}

export async function consumeChatStream(
  response: Response,
  onEvent: (event: ChatStreamEvent) => void
): Promise<void> {
  if (response.body === null) throw invalidStream();

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let pending = '';
  let terminal = false;

  const consumeLines = () => {
    let newlineIndex = pending.indexOf('\n');
    while (newlineIndex >= 0) {
      if (terminal) throw invalidStream();
      const line = pending.slice(0, newlineIndex);
      pending = pending.slice(newlineIndex + 1);
      if (line.length > 0) {
        let value: unknown;
        try {
          value = JSON.parse(line);
        } catch {
          throw invalidStream();
        }
        const parsed = chatStreamEventSchema.safeParse(value);
        if (!parsed.success) throw invalidStream();
        terminal = terminalTypes.has(parsed.data.type);
        onEvent(parsed.data);
      }
      newlineIndex = pending.indexOf('\n');
    }
    if (terminal && pending.length > 0) throw invalidStream();
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (terminal && value.byteLength > 0) throw invalidStream();
    try {
      pending += decoder.decode(value, { stream: true });
    } catch {
      throw invalidStream();
    }
    consumeLines();
  }

  try {
    pending += decoder.decode();
  } catch {
    throw invalidStream();
  }
  consumeLines();
  if (!terminal || pending.length > 0) throw invalidStream();
}

export const chatApi = {
  createConversation: () =>
    apiClient.request<ChatConversationSummary>('/chat/conversations', { method: 'POST' }),
  listConversations: (cursor?: string) =>
    apiClient.request<ChatConversationList>(cursorPath('/chat/conversations', cursor)),
  getConversation: (id: string, cursor?: string) =>
    apiClient.request<ChatConversationDetail>(
      cursorPath(`/chat/conversations/${encodeURIComponent(id)}`, cursor)
    ),
  deleteConversation: (id: string) =>
    apiClient.request<void>(`/chat/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  sendMessage: async (
    id: string,
    input: ChatMessageInput,
    onEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<void> => {
    const body = new FormData();
    body.append('text', input.text);
    for (const image of input.images) body.append('images', image);
    const response = await apiClient.response(`/chat/conversations/${encodeURIComponent(id)}/messages`, {
      method: 'POST',
      body,
      signal
    });
    await consumeChatStream(response, onEvent);
  },
  regenerate: async (
    id: string,
    userMessageId: string,
    onEvent: (event: ChatStreamEvent) => void,
    signal: AbortSignal
  ): Promise<void> => {
    const response = await apiClient.response(
      `/chat/conversations/${encodeURIComponent(id)}/messages/${encodeURIComponent(userMessageId)}/regenerate`,
      { method: 'POST', signal }
    );
    await consumeChatStream(response, onEvent);
  },
  cancel: (id: string, runId: string) =>
    apiClient.request<void>(
      `/chat/conversations/${encodeURIComponent(id)}/runs/${encodeURIComponent(runId)}/cancel`,
      { method: 'POST' }
    )
};
