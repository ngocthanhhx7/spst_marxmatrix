import { describe, expect, it, vi } from 'vitest';
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

  it.each([
    ['RAG_DOCUMENT_NOT_READY', 409],
    ['RAG_DOCUMENT_EMPTY', 422],
    ['RAG_EMBEDDING_INVALID', 502],
    ['RAG_AI_AUTH_FAILED', 503]
  ])('does not retry permanent %s failures', async (code, statusCode) => {
    const handler = new EmbedDocumentHandler(
      {
        reindexDocument: async () =>
          Promise.reject(new DomainError(code, 'private permanent detail', statusCode))
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
    ).rejects.toMatchObject({ errorCode: 'EMBEDDING_FAILED', retryable: false });
  });

  it('retries when another worker still holds the document embedding claim', async () => {
    const handler = new EmbedDocumentHandler(
      {
        reindexDocument: async () =>
          Promise.reject(new DomainError('RAG_EMBEDDING_BUSY', 'claim held', 409))
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

  it('passes the worker cancellation signal into document ingestion', async () => {
    const reindexDocument = vi.fn(() => Promise.resolve());
    const handler = new EmbedDocumentHandler(
      { reindexDocument } as never,
      new JobHandlerRegistry()
    );
    const controller = new AbortController();

    await handler.handle(
      {
        payload: { documentId: { toString: () => '507f1f77bcf86cd799439011' } }
      } as never,
      controller.signal
    );

    expect(reindexDocument).toHaveBeenCalledWith('507f1f77bcf86cd799439011', controller.signal);
  });
});
