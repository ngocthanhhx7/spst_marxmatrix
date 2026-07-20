import { describe, expect, it } from 'vitest';
import { DomainError } from '../common/domain-error.js';
import { JobHandlerRegistry } from '../jobs/worker-runner.js';
import { EmbedDocumentHandler } from './embed-document.handler.js';

describe('EmbedDocumentHandler', () => {
  it('keeps embedding failures retryable by the queue default', async () => {
    const handler = new EmbedDocumentHandler(
      {
        reindexDocument: async () =>
          Promise.reject(new DomainError('RAG_AI_REQUEST_FAILED', 'private detail', 503))
      } as never,
      new JobHandlerRegistry()
    );

    await expect(
      handler.handle(
        {
          payload: { documentId: { toString: () => '507f1f77bcf86cd799439011' } }
        } as never,
        new AbortController().signal
      )
    ).rejects.toMatchObject({ errorCode: 'EMBEDDING_FAILED', retryable: true });
  });
});
