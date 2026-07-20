/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it, vi } from 'vitest';
import { RAG_EMBEDDING_DIMENSION } from './gemini-rag.provider.js';
import { RagIngestionService } from './rag-ingestion.service.js';

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
    expect(updates).toContainEqual([
      expect.objectContaining({
        _id: document._id,
        courseId: 'MLN112',
        parsedPageToken: 'winner-token',
        deletionState: 'active',
        status: 'embedding'
      }),
      {
        $set: {
          status: 'failed',
          errorCode: 'EMBEDDING_FAILED',
          errorMessage: 'Document indexing could not be completed.'
        }
      }
    ]);
  });

  it('reclaims only a failed document whose embedding previously failed', async () => {
    const claimFilters: unknown[] = [];
    const document = { ...fixtureDocument(), status: 'failed', errorCode: 'EMBEDDING_FAILED' };
    const service = serviceWith({ document, claimFilters });

    await expect(service.reindexDocument(documentId)).resolves.toBeUndefined();
    expect(claimFilters[0]).toMatchObject({
      $or: [
        { status: { $in: ['parsed', 'embedding', 'ready'] } },
        { status: 'failed', errorCode: 'EMBEDDING_FAILED' }
      ]
    });

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
};

function serviceWith(options: {
  document: FixtureDocument;
  pages?: { pageNumber: number; text: string }[];
  embed?: (text: string) => Promise<number[]>;
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
      embed: options.embed ?? (async () => new Array<number>(RAG_EMBEDDING_DIMENSION).fill(0.5))
    }
  );
}
