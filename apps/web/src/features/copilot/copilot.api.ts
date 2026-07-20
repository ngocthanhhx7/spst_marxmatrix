import type { Citation, RagClaim, RagMode, RagResponse } from './copilot.types.js';
import { apiClient } from '../../shared/api/runtime.js';

export const copilotModes = ['query', 'outline', 'comparison', 'critique'] as const;

export const copilotApi = {
  availableDocuments: () =>
    apiClient.request<Array<{ id: string; title: string; pageCount: number }>>(
      '/rag/documents?courseId=MLN112'
    ),
  ask: (input: { courseId: string; documentIds: string[]; mode: RagMode; question: string }) =>
    apiClient.request<RagResponse>('/rag/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    })
};

export type { Citation, RagClaim, RagMode, RagResponse };
