import type {
  Citation,
  PrivateCopilotDocument,
  PrivateCopilotQuery,
  RagClaim,
  RagMode,
  RagResponse
} from './copilot.types.js';
import { apiClient } from '../../shared/api/runtime.js';

export const copilotModes = ['query', 'outline', 'comparison', 'critique'] as const;

export const copilotApi = {
  availableDocuments: () =>
    apiClient.request<Array<{ id: string; title: string; pageCount: number }>>(
      '/rag/documents?courseId=MLN112'
    ),
  privateDocuments: () => apiClient.request<PrivateCopilotDocument[]>('/copilot/documents'),
  uploadDocument: (input: { file: File; title?: string }) => {
    const body = new FormData();
    body.set('file', input.file);
    if (input.title !== undefined && input.title.trim().length > 0) body.set('title', input.title);
    return apiClient.request<PrivateCopilotDocument>('/copilot/documents', {
      method: 'POST',
      body
    });
  },
  deleteDocument: (documentId: string) =>
    apiClient.request<void>(`/copilot/documents/${documentId}`, { method: 'DELETE' }),
  ask: (input: { courseId: string; documentIds: string[]; mode: RagMode; question: string }) =>
    apiClient.request<RagResponse>('/rag/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    }),
  askPrivate: (input: PrivateCopilotQuery) =>
    apiClient.request<RagResponse>('/copilot/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    })
};

export type { Citation, RagClaim, RagMode, RagResponse };
