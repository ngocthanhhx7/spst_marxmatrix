/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it, vi } from 'vitest';
import { RAG_EMBEDDING_DIMENSION } from './gemini-rag.provider.js';
import { RAG_EMBEDDING_CLAIM_TIMEOUT_MS, RagIngestionService } from './rag-ingestion.service.js';

const documentId = '507f1f77bcf86cd799439011';

describe('RagIngestionService', () => {
  it('cleans only the winning parse token so an old worker cannot delete newer chunks', async () => {
    const deletionFilters: unknown[] = [];
    const document = {
      _id: { toString: () => documentId },
      ownerId: { toString: () => '507f1f77bcf86cd799439012' },
      courseId: 'MLN112',
      parsedPageToken: 'winner-token',
      status: 'parsed',
      deletionState: 'active'
    };
    const service = new RagIngestionService(
      {
        findById: () => ({ select: async () => document }),
        findOneAndUpdate: () => ({ select: async () => document }),
        exists: async () => ({ _id: document._id }),
        updateOne: async () => ({ matchedCount: 1 })
      } as never,
      {
        find: () => ({
          sort: async () => [{ pageNumber: 1, text: 'Giá trị thặng dư được dùng cho fixture.' }]
        })
      } as never,
      {
        bulkWrite: async () => undefined,
        deleteMany: async (filter: unknown) => deletionFilters.push(filter)
      } as never,
      { embed: async () => new Array<number>(RAG_EMBEDDING_DIMENSION).fill(0.5) }
    );

    await service.reindexDocument(documentId);

    expect(deletionFilters).toEqual([
      expect.objectContaining({ documentId: document._id, parseToken: 'winner-token' })
    ]);
    expect(deletionFilters[0]).not.toHaveProperty('$or');
  });

  it('marks the same embedding version failed when an embedding request rejects', async () => {
    const updates: unknown[][] = [];
    const document = fixtureDocument();
    const service = serviceWith({
      document,
      embed: async () => Promise.reject(new Error('provider detail')),
      updateOne: async (...args: unknown[]) => {
        updates.push(args);
        return { matchedCount: 1 };
      }
    });

    await expect(service.reindexDocument(documentId)).rejects.toThrow('provider detail');
    const failedFilter = updates[0]?.[0] as { embeddingToken?: unknown };
    expect(failedFilter).toMatchObject({
      _id: document._id,
      courseId: 'MLN112',
      parsedPageToken: 'winner-token',
      deletionState: 'active',
      status: 'embedding'
    });
    expect(typeof failedFilter.embeddingToken).toBe('string');
    expect(updates[0]?.[1]).toEqual({
      $set: {
        status: 'failed',
        embeddingStartedAt: null,
        embeddingToken: null,
        errorCode: 'EMBEDDING_FAILED',
        errorMessage: 'Document indexing could not be completed.'
      }
    });
  });

  it('reclaims only a failed document whose embedding previously failed', async () => {
    const claimFilters: unknown[] = [];
    const document = { ...fixtureDocument(), status: 'failed', errorCode: 'EMBEDDING_FAILED' };
    const service = serviceWith({ document, claimFilters });

    await expect(service.reindexDocument(documentId)).resolves.toBeUndefined();
    const claimFilter = claimFilters[0] as {
      $or: [
        { status: unknown },
        { status: unknown },
        { $or: [{ embeddingStartedAt: { $lte: unknown } }] }
      ];
    };
    expect(claimFilter).toMatchObject({
      $or: [
        { status: { $in: ['parsed', 'ready'] } },
        { status: 'failed', errorCode: 'EMBEDDING_FAILED' },
        {
          status: 'embedding',
          $or: [
            { embeddingStartedAt: { $lte: claimFilter.$or[2].$or[0].embeddingStartedAt.$lte } },
            { embeddingStartedAt: null }
          ]
        }
      ]
    });
    expect(claimFilter.$or[2].$or[0].embeddingStartedAt.$lte).toBeInstanceOf(Date);

    const parseFailure = { ...document, errorCode: 'PDF_PARSE_FAILED' };
    await expect(
      serviceWith({ document: parseFailure }).reindexDocument(documentId)
    ).rejects.toMatchObject({
      code: 'RAG_DOCUMENT_NOT_READY'
    });
  });

  it('embeds at most four chunks concurrently while preserving draft order', async () => {
    const document = fixtureDocument();
    let active = 0;
    let peak = 0;
    const releases: (() => void)[] = [];
    const started: string[] = [];
    const embed = vi.fn(async (text: string) => {
      active += 1;
      peak = Math.max(peak, active);
      started.push(text);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return new Array<number>(RAG_EMBEDDING_DIMENSION).fill(Number(text.split(' ')[1]));
    });
    const writes: unknown[] = [];
    const service = serviceWith({
      document,
      pages: Array.from({ length: 6 }, (_, index) => ({
        pageNumber: index + 1,
        text: `page ${index + 1}`
      })),
      embed,
      bulkWrite: async (operations: unknown[]) => {
        writes.push(...operations);
      }
    });

    const indexing = service.reindexDocument(documentId);
    await vi.waitFor(() => expect(embed).toHaveBeenCalledTimes(4));
    expect(peak).toBe(4);
    releases.splice(0, 4).forEach((release) => release());
    await vi.waitFor(() => expect(embed).toHaveBeenCalledTimes(6));
    releases.splice(0).forEach((release) => release());
    await indexing;

    expect(peak).toBeLessThanOrEqual(4);
    expect(started).toEqual(['page 1', 'page 2', 'page 3', 'page 4', 'page 5', 'page 6']);
    expect(
      writes.map(
        (operation) =>
          (operation as { updateOne: { update: { $set: { embedding: number[] } } } }).updateOne
            .update.$set.embedding[0]
      )
    ).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('uses a provider batch embedding capability for all document chunks', async () => {
    const embed = vi.fn(async () => {
      throw new Error('Single-item embedding must not be used when batching is available.');
    });
    const embedMany = vi.fn(async (texts: readonly string[]) =>
      texts.map((text) =>
        new Array<number>(RAG_EMBEDDING_DIMENSION).fill(Number(text.split(' ')[1]))
      )
    );
    const writes: unknown[] = [];
    const service = serviceWith({
      document: fixtureDocument(),
      pages: Array.from({ length: 6 }, (_, index) => ({
        pageNumber: index + 1,
        text: `page ${index + 1}`
      })),
      embed,
      embedMany,
      bulkWrite: async (operations: unknown[]) => {
        writes.push(...operations);
      }
    });

    await service.reindexDocument(documentId);

    expect(embedMany).toHaveBeenCalledOnce();
    expect(embedMany).toHaveBeenCalledWith(
      ['page 1', 'page 2', 'page 3', 'page 4', 'page 5', 'page 6'],
      undefined
    );
    expect(embed).not.toHaveBeenCalled();
    expect(
      writes.map(
        (operation) =>
          (operation as { updateOne: { update: { $set: { embedding: number[] } } } }).updateOne
            .update.$set.embedding[0]
      )
    ).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('stops claiming new chunks after the first failure and waits for active embeds to settle', async () => {
    const document = fixtureDocument();
    let rejectFirst: ((error: Error) => void) | undefined;
    const activeResolvers: (() => void)[] = [];
    const embed = vi.fn((text: string) => {
      if (text === 'page 1')
        return new Promise<number[]>((_resolve, reject) => {
          rejectFirst = reject;
        });
      return new Promise<number[]>((resolve) => {
        activeResolvers.push(() => resolve(new Array<number>(RAG_EMBEDDING_DIMENSION).fill(0.5)));
      });
    });
    const service = serviceWith({
      document,
      pages: Array.from({ length: 7 }, (_, index) => ({
        pageNumber: index + 1,
        text: `page ${index + 1}`
      })),
      embed
    });

    const indexing = service.reindexDocument(documentId);
    await vi.waitFor(() => expect(embed).toHaveBeenCalledTimes(4));
    rejectFirst?.(new Error('first embedding failed'));
    let rejected = false;
    void indexing.catch(() => {
      rejected = true;
    });
    await Promise.resolve();
    expect(rejected).toBe(false);
    expect(embed).toHaveBeenCalledTimes(4);

    activeResolvers.splice(0).forEach((resolve) => resolve());
    await expect(indexing).rejects.toThrow('first embedding failed');
    expect(embed).toHaveBeenCalledTimes(4);
  });

  it('rejects a still-live claim retryably when a queue lease can be reclaimed first', async () => {
    const embed = vi.fn(async () => new Array<number>(RAG_EMBEDDING_DIMENSION).fill(0.5));
    const document = {
      ...fixtureDocument(),
      status: 'embedding',
      embeddingStartedAt: new Date(Date.now() - Math.floor(RAG_EMBEDDING_CLAIM_TIMEOUT_MS * 0.98)),
      embeddingToken: 'active-token'
    };

    await expect(
      serviceWith({ document, embed }).reindexDocument(documentId)
    ).rejects.toMatchObject({ code: 'RAG_EMBEDDING_BUSY', statusCode: 409 });
    expect(embed).not.toHaveBeenCalled();
  });

  it('reclaims a legacy embedding claim that has no persisted start timestamp', async () => {
    const document = {
      ...fixtureDocument(),
      status: 'embedding'
    };

    await expect(serviceWith({ document }).reindexDocument(documentId)).resolves.toBeUndefined();
  });

  it('propagates cancellation to active embeds and performs no chunk writes', async () => {
    const controller = new AbortController();
    const bulkWrite = vi.fn(() => Promise.resolve());
    const embed = vi.fn(
      (_text: string, signal?: AbortSignal) =>
        new Promise<number[]>((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true }
          );
        })
    );
    const service = serviceWith({
      document: fixtureDocument(),
      pages: Array.from({ length: 6 }, (_, index) => ({
        pageNumber: index + 1,
        text: `page ${index + 1}`
      })),
      embed,
      bulkWrite
    });
    const indexing = service.reindexDocument(documentId, controller.signal);
    await vi.waitFor(() => expect(embed).toHaveBeenCalledTimes(4));

    controller.abort();

    await expect(indexing).rejects.toMatchObject({ code: 'RAG_OPERATION_ABORTED' });
    expect(embed).toHaveBeenCalledTimes(4);
    expect(bulkWrite).not.toHaveBeenCalled();
  });
});

function fixtureDocument() {
  return {
    _id: { toString: () => documentId },
    ownerId: { toString: () => '507f1f77bcf86cd799439012' },
    courseId: 'MLN112',
    parsedPageToken: 'winner-token',
    status: 'parsed',
    errorCode: null,
    deletionState: 'active'
  } satisfies FixtureDocument;
}

type FixtureDocument = {
  _id: { toString: () => string };
  ownerId: { toString: () => string };
  courseId: string;
  parsedPageToken: string;
  status: string;
  errorCode: string | null;
  deletionState: string;
  embeddingStartedAt?: Date | null;
  embeddingToken?: string | null;
};

function serviceWith(options: {
  document: FixtureDocument;
  pages?: { pageNumber: number; text: string }[];
  embed?: (text: string, signal?: AbortSignal) => Promise<number[]>;
  embedMany?: (texts: readonly string[], signal?: AbortSignal) => Promise<number[][]>;
  updateOne?: (...args: unknown[]) => Promise<{ matchedCount: number }>;
  bulkWrite?: (operations: unknown[]) => Promise<void>;
  claimFilters?: unknown[];
}) {
  return new RagIngestionService(
    {
      findById: () => ({ select: async () => options.document }),
      findOneAndUpdate: (filter: unknown) => {
        options.claimFilters?.push(filter);
        return { select: async () => options.document };
      },
      exists: async () => ({ _id: options.document._id }),
      updateOne: options.updateOne ?? (async () => ({ matchedCount: 1 }))
    } as never,
    {
      find: () => ({
        sort: async () => options.pages ?? [{ pageNumber: 1, text: 'page 1' }]
      })
    } as never,
    {
      bulkWrite: options.bulkWrite ?? (async () => undefined),
      deleteMany: async () => undefined
    } as never,
    {
      embed: options.embed ?? (async () => new Array<number>(RAG_EMBEDDING_DIMENSION).fill(0.5)),
      ...(options.embedMany === undefined ? {} : { embedMany: options.embedMany })
    }
  );
}
