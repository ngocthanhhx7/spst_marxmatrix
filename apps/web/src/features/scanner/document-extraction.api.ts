import type { DocumentMetadata } from '@marxmatrix/contracts';
import type { AnalysisListItem } from '@marxmatrix/contracts';
import { apiClient } from '../../shared/api/runtime.js';

export type ExtractedFinancialFact = {
  id: string;
  label: string;
  value: number;
  currency: string;
  scale: 'ones' | 'thousands' | 'millions' | 'billions';
  reportingPeriod: string;
  classification: string;
  reviewStatus: 'pending_review' | 'approved' | 'rejected' | 'reclassified';
  sourcePage: number | null;
  evidenceText: string | null;
};
export type DocumentExtractionEnvelope = {
  facts: ExtractedFinancialFact[];
  simulated: boolean | null;
  model: string | null;
  promptVersion: string | null;
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null;
};

export const documentExtractionApi = {
  listDocuments: () => apiClient.request<DocumentMetadata[]>('/documents'),
  listAnalyses: () => apiClient.request<AnalysisListItem[]>('/analyses'),
  uploadDocument: (input: { title: string; file: File }) => {
    const body = new FormData();
    body.set('title', input.title);
    body.set('type', 'financial_report');
    body.set('file', input.file);
    return apiClient.request<DocumentMetadata>('/documents', { method: 'POST', body });
  },
  listExtractions: async (documentId: string): Promise<DocumentExtractionEnvelope> => {
    const result = await apiClient.request<DocumentExtractionEnvelope | ExtractedFinancialFact[]>(
      `/documents/${documentId}/extractions`
    );
    return Array.isArray(result)
      ? { facts: result, simulated: null, model: null, promptVersion: null, usage: null }
      : result;
  },
  queueExtraction: (documentId: string, analysisId: string) =>
    apiClient.request<{
      status: 'queued' | 'already-complete';
      documentId: string;
      analysisId: string;
    }>(`/documents/${documentId}/extractions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ analysisId })
    })
};
