import { apiClient } from '../../shared/api/runtime.js';

export type AdminDocument = {
  id: string;
  title: string;
  status: 'uploaded' | 'parsing' | 'parsed' | 'embedding' | 'ready' | 'failed';
  pageCount: number;
  errorMessage: string | null;
  updatedAt: string;
  failedJobId?: string | null;
};

export const adminDocumentsApi = {
  list: () => apiClient.request<AdminDocument[]>('/admin/documents'),
  upload: (input: { title: string; file: File }) => {
    const body = new FormData();
    body.set('title', input.title);
    body.set('type', 'textbook');
    body.set('courseId', 'MLN112');
    body.set('file', input.file);
    return apiClient.request<AdminDocument>('/admin/documents', { method: 'POST', body });
  },
  reindex: (documentId: string) =>
    apiClient.request<{ status: 'queued' | 'already-complete' }>(
      `/admin/documents/${documentId}/reindex`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ courseId: 'MLN112' })
      }
    ),
  retryJob: (jobId: string) => apiClient.request(`/admin/jobs/${jobId}/retry`, { method: 'POST' })
};
