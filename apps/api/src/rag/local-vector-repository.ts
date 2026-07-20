import type { RagChunk, RetrievedChunk } from '@marxmatrix/contracts';

export interface RagSearchFilter {
  ownerId: string;
  courseId: string;
  documentIds: readonly string[];
  documentParseTokens: readonly { documentId: string; parseToken: string }[];
  queryVector: readonly number[];
  limit: number;
}

export interface VectorRepository {
  search(filter: RagSearchFilter): Promise<RetrievedChunk[]>;
}

export type IndexedChunk = RagChunk;

/** A bounded in-process implementation used by tests and explicit local demo flows. */
export class LocalVectorRepository implements VectorRepository {
  public constructor(private readonly chunks: readonly IndexedChunk[]) {}

  async search(filter: RagSearchFilter): Promise<RetrievedChunk[]> {
    await Promise.resolve();
    validateFilter(filter);
    const requestedDocuments = new Set(filter.documentIds);
    const requestedTokens = new Map(
      filter.documentParseTokens.map((entry) => [entry.documentId, entry.parseToken])
    );
    return this.chunks
      .filter(
        (chunk) =>
          chunk.ownerId === filter.ownerId &&
          chunk.courseId === filter.courseId &&
          requestedDocuments.has(chunk.documentId) &&
          requestedTokens.get(chunk.documentId) === chunk.parseToken
      )
      .map((chunk) => ({
        id: chunk.id,
        courseId: chunk.courseId,
        documentId: chunk.documentId,
        parseToken: chunk.parseToken,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        text: chunk.text,
        score: cosineSimilarity(filter.queryVector, chunk.embedding)
      }))
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, filter.limit);
  }
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (leftValue === undefined || rightValue === undefined) return 0;
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) return 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }
  if (leftMagnitude === 0 || rightMagnitude === 0) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export function validateFilter(filter: RagSearchFilter): void {
  if (filter.ownerId.trim().length === 0) throw new RangeError('An owner filter is required.');
  if (filter.courseId.trim().length === 0) throw new RangeError('A course filter is required.');
  if (filter.documentIds.length === 0 || filter.documentIds.length > 10)
    throw new RangeError('A bounded document filter is required.');
  if (
    filter.documentParseTokens.length !== filter.documentIds.length ||
    filter.documentParseTokens.some(
      (entry) =>
        !filter.documentIds.includes(entry.documentId) || entry.parseToken.trim().length === 0
    )
  )
    throw new RangeError('A current parse-token filter is required.');
  if (filter.queryVector.length === 0 || filter.queryVector.length > 256)
    throw new RangeError('A bounded query vector is required.');
  if (filter.queryVector.some((value) => !Number.isFinite(value)))
    throw new RangeError('Query vectors must be finite.');
  if (!Number.isInteger(filter.limit) || filter.limit < 1 || filter.limit > 10)
    throw new RangeError('Search limit must be an integer between 1 and 10.');
}
