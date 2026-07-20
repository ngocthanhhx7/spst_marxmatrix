import { createHash } from 'node:crypto';
import { RAG_EMBEDDING_DIMENSION } from '@marxmatrix/contracts';

export { RAG_EMBEDDING_DIMENSION } from '@marxmatrix/contracts';

export interface TextEmbedder {
  embed(text: string, signal?: AbortSignal): Promise<number[]>;
}

/** Deterministic, non-network demo embedding; live providers must be explicitly configured separately. */
export class DeterministicTextEmbedder implements TextEmbedder {
  embed(text: string, signal?: AbortSignal): Promise<number[]> {
    if (signal?.aborted)
      return Promise.reject(new DOMException('Embedding aborted.', 'AbortError'));
    const vector = new Array<number>(RAG_EMBEDDING_DIMENSION).fill(0);
    for (const token of text
      .normalize('NFKC')
      .toLocaleLowerCase('vi-VN')
      .match(/[\p{L}\p{N}]+/gu) ?? []) {
      const digest = createHash('sha256').update(token, 'utf8').digest();
      const firstByte = digest[0];
      const secondByte = digest[1];
      if (firstByte === undefined || secondByte === undefined) continue;
      const index = firstByte % vector.length;
      const direction = secondByte % 2 === 0 ? 1 : -1;
      const previous = vector[index];
      if (previous !== undefined) vector[index] = previous + direction;
    }
    return Promise.resolve(vector);
  }
}
