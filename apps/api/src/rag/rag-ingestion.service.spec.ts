/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest';
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
});
