/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest';
import { AdminRagService } from './admin-rag.service.js';

const documentId = '507f1f77bcf86cd799439011';

describe('AdminRagService', () => {
  it('returns a stable document DTO with the latest failed RAG job', async () => {
    const service = new AdminRagService(
      {
        find: () => ({
          sort: async () => [
            {
              _id: { toString: () => documentId },
              title: 'MLN112 demo',
              courseId: 'MLN112',
              status: 'ready',
              pageCount: 3,
              errorCode: null,
              errorMessage: null,
              updatedAt: new Date('2026-07-19T00:00:00.000Z')
            }
          ]
        })
      } as never,
      {} as never,
      {} as never,
      {
        findOne: () => ({
          sort: async () => ({ _id: { toString: () => '507f1f77bcf86cd799439012' } })
        })
      } as never
    );

    await expect(service.list()).resolves.toEqual([
      expect.objectContaining({
        id: documentId,
        updatedAt: '2026-07-19T00:00:00.000Z',
        failedJobId: '507f1f77bcf86cd799439012'
      })
    ]);
  });

  it('only reindexes a parsed textbook with a deterministic course and parse-token key', async () => {
    const enqueued: unknown[] = [];
    const service = new AdminRagService(
      {
        findOneAndUpdate: async () => ({
          _id: { toString: () => documentId },
          status: 'parsed',
          parsedPageToken: 'parse-v3'
        })
      } as never,
      {} as never,
      { enqueue: async (input: unknown) => (enqueued.push(input), { status: 'queued' }) } as never,
      {} as never
    );

    await service.reindex(documentId, 'MLN112');
    expect(enqueued).toEqual([
      expect.objectContaining({
        type: 'embed_document',
        idempotencyKey: `embed_document:${documentId}:MLN112:parse-v3`
      })
    ]);
  });

  it('requeues an existing terminal failed RAG index job instead of creating a random duplicate', async () => {
    const retries: string[] = [];
    const service = new AdminRagService(
      {
        findOneAndUpdate: async () => ({
          _id: { toString: () => documentId },
          status: 'ready',
          parsedPageToken: 'parse-v3'
        })
      } as never,
      {} as never,
      {
        enqueue: async () => ({
          _id: { toString: () => '507f1f77bcf86cd799439012' },
          status: 'failed'
        }),
        requeueFailed: async (id: string) => (retries.push(id), { status: 'queued' })
      } as never,
      {} as never
    );

    await expect(service.reindex(documentId, 'MLN112')).resolves.toMatchObject({
      status: 'queued'
    });
    expect(retries).toEqual(['507f1f77bcf86cd799439012']);
  });

  it('does not enqueue indexing before the document has a committed parse token', async () => {
    let enqueues = 0;
    const service = new AdminRagService(
      { findOneAndUpdate: async () => null } as never,
      {} as never,
      {
        enqueue: async () => {
          enqueues += 1;
          return {};
        }
      } as never,
      {} as never
    );

    await expect(service.reindex(documentId, 'MLN112')).rejects.toMatchObject({
      code: 'RAG_DOCUMENT_NOT_READY'
    });
    expect(enqueues).toBe(0);
  });

  it('rejects retries for non-RAG jobs', async () => {
    const service = new AdminRagService(
      {} as never,
      {} as never,
      { requeueFailed: async () => ({}) } as never,
      { findById: async () => ({ type: 'parse_pdf' }) } as never
    );

    await expect(service.retry('507f1f77bcf86cd799439012')).rejects.toMatchObject({
      code: 'RAG_JOB_NOT_FOUND'
    });
  });

  it('rejects a malformed retry job id before invoking Mongoose', async () => {
    let lookups = 0;
    const service = new AdminRagService(
      {} as never,
      {} as never,
      {} as never,
      {
        findById: async () => {
          lookups += 1;
          return null;
        }
      } as never
    );

    await expect(service.retry('not-an-object-id')).rejects.toMatchObject({
      code: 'RAG_JOB_NOT_FOUND'
    });
    expect(lookups).toBe(0);
  });
});
