import { describe, expect, it } from 'vitest';
import { LocalVectorRepository } from './local-vector-repository.js';

const ownerId = '507f1f77bcf86cd799439011';
const documentId = '507f1f77bcf86cd799439012';
const otherDocumentId = '507f1f77bcf86cd799439013';

function vector(first: number, second: number): number[] {
  const value = new Array<number>(768).fill(0);
  value[0] = first;
  value[1] = second;
  return value;
}

describe('LocalVectorRepository', () => {
  it('orders cosine matches while enforcing owner, course and document filters', async () => {
    const repository = new LocalVectorRepository([
      {
        id: '507f1f77bcf86cd799439014',
        ownerId,
        courseId: 'MLN112',
        documentId,
        parseToken: 'token',
        pageStart: 1,
        pageEnd: 1,
        text: 'phù hợp nhất',
        checksum: 'a'.repeat(64),
        embedding: vector(1, 0)
      },
      {
        id: '507f1f77bcf86cd799439015',
        ownerId,
        courseId: 'MLN112',
        documentId,
        parseToken: 'token',
        pageStart: 2,
        pageEnd: 2,
        text: 'phù hợp thứ hai',
        checksum: 'b'.repeat(64),
        embedding: vector(0.5, 0.5)
      },
      {
        id: '507f1f77bcf86cd799439016',
        ownerId,
        courseId: 'MLN112',
        documentId: otherDocumentId,
        parseToken: 'token',
        pageStart: 1,
        pageEnd: 1,
        text: 'không được truy xuất',
        checksum: 'c'.repeat(64),
        embedding: vector(1, 0)
      }
    ]);

    const results = await repository.search({
      ownerId,
      courseId: 'MLN112',
      documentIds: [documentId],
      documentParseTokens: [{ documentId, parseToken: 'token' }],
      queryVector: vector(1, 0),
      limit: 2
    });

    expect(results.map((result) => result.id)).toEqual([
      '507f1f77bcf86cd799439014',
      '507f1f77bcf86cd799439015'
    ]);
  });

  it('returns a finite zero score for a zero vector and rejects unbounded filter input', async () => {
    const repository = new LocalVectorRepository([]);

    await expect(
      repository.search({
        ownerId,
        courseId: 'MLN112',
        documentIds: [documentId],
        documentParseTokens: [{ documentId, parseToken: 'token' }],
        queryVector: vector(0, 0),
        limit: 1
      })
    ).resolves.toEqual([]);
    await expect(
      repository.search({
        ownerId,
        courseId: 'MLN112',
        documentIds: [],
        documentParseTokens: [],
        queryVector: vector(1, 0),
        limit: 1
      })
    ).rejects.toThrow('document filter');
  });

  it('excludes a stale parse token even when its vector would otherwise rank first', async () => {
    const repository = new LocalVectorRepository([
      {
        id: '507f1f77bcf86cd799439017',
        ownerId,
        courseId: 'MLN112',
        documentId,
        parseToken: 'old-token',
        pageStart: 1,
        pageEnd: 1,
        text: 'stale source',
        checksum: 'd'.repeat(64),
        embedding: vector(1, 0)
      },
      {
        id: '507f1f77bcf86cd799439018',
        ownerId,
        courseId: 'MLN112',
        documentId,
        parseToken: 'current-token',
        pageStart: 1,
        pageEnd: 1,
        text: 'current source',
        checksum: 'e'.repeat(64),
        embedding: vector(0, 1)
      }
    ]);

    const results = await repository.search({
      ownerId,
      courseId: 'MLN112',
      documentIds: [documentId],
      documentParseTokens: [{ documentId, parseToken: 'current-token' }],
      queryVector: vector(1, 0),
      limit: 2
    });

    expect(results.map((result) => result.id)).toEqual(['507f1f77bcf86cd799439018']);
  });

  it('retrieves against the production 768-dimensional embedding contract', async () => {
    const vector = new Array<number>(768).fill(0);
    vector[767] = 1;
    const repository = new LocalVectorRepository([
      {
        id: '507f1f77bcf86cd799439019',
        ownerId,
        courseId: 'MLN112',
        documentId,
        parseToken: 'token',
        pageStart: 1,
        pageEnd: 1,
        text: 'production-width source',
        checksum: 'f'.repeat(64),
        embedding: vector
      }
    ]);

    await expect(
      repository.search({
        ownerId,
        courseId: 'MLN112',
        documentIds: [documentId],
        documentParseTokens: [{ documentId, parseToken: 'token' }],
        queryVector: vector,
        limit: 1
      })
    ).resolves.toMatchObject([{ id: '507f1f77bcf86cd799439019', score: 1 }]);
  });
});
