import { createHash } from 'node:crypto';

export interface TextEmbedder {
  embed(text: string): Promise<number[]>;
}

/** Shared persisted-vector width for demo, local Mongo and Atlas repositories. */
export const RAG_EMBEDDING_DIMENSION = 768;

/** Deterministic, non-network demo embedding; live providers must be explicitly configured separately. */
export class DeterministicTextEmbedder implements TextEmbedder {
  embed(text: string): Promise<number[]> {
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
