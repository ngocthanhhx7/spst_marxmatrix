import { describe, expect, it } from 'vitest';
import { AtlasVectorRepository } from './atlas-vector.repository.js';

describe('AtlasVectorRepository', () => {
  it('passes a 768-dimensional query to the Atlas vector-search stage', async () => {
    const pipelines: unknown[][] = [];
    const repository = new AtlasVectorRepository({
      aggregate: (pipeline: unknown[]) => {
        pipelines.push(pipeline);
        return { exec: () => Promise.resolve([]) };
      }
    } as never);
    const queryVector = new Array<number>(768).fill(0.25);

    await expect(
      repository.search({
        ownerId: '507f1f77bcf86cd799439011',
        courseId: 'MLN112',
        documentIds: ['507f1f77bcf86cd799439012'],
        documentParseTokens: [
          { documentId: '507f1f77bcf86cd799439012', parseToken: 'current-token' }
        ],
        queryVector,
        limit: 3
      })
    ).resolves.toEqual([]);
    const vectorSearch = (
      pipelines[0]?.[0] as {
        $vectorSearch: { path: string; queryVector: number[] };
      }
    ).$vectorSearch;
    expect(vectorSearch.path).toBe('embedding');
    expect(vectorSearch.queryVector).toEqual(queryVector);
    expect(vectorSearch.queryVector).toHaveLength(768);
  });
});
