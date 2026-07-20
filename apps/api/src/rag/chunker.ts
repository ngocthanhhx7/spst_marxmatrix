import { createHash } from 'node:crypto';

export interface SourcePage {
  pageNumber: number;
  text: string;
}

export interface ChunkDraft {
  pageStart: number;
  pageEnd: number;
  text: string;
  checksum: string;
}

export interface ChunkingOptions {
  wordsPerChunk?: number;
  overlapWords?: number;
}

const DEFAULT_WORDS_PER_CHUNK = 180;
const DEFAULT_OVERLAP_WORDS = 30;

/** Splits each extracted PDF page independently, so a citation cannot span an unknown boundary. */
export function chunkDocumentPages(
  pages: readonly SourcePage[],
  options: ChunkingOptions = {}
): ChunkDraft[] {
  const wordsPerChunk = options.wordsPerChunk ?? DEFAULT_WORDS_PER_CHUNK;
  const overlapWords = options.overlapWords ?? DEFAULT_OVERLAP_WORDS;
  assertOptions(wordsPerChunk, overlapWords);

  const uniquePageNumbers = new Set<number>();
  const chunks: ChunkDraft[] = [];
  for (const page of [...pages].sort((left, right) => left.pageNumber - right.pageNumber)) {
    if (!Number.isInteger(page.pageNumber) || page.pageNumber < 1)
      throw new RangeError('Pages must have positive integer page numbers.');
    if (uniquePageNumbers.has(page.pageNumber))
      throw new RangeError('Pages must have unique page numbers.');
    uniquePageNumbers.add(page.pageNumber);

    const words = page.text.trim().match(/\S+/gu) ?? [];
    for (
      let start = 0;
      start < words.length && (start === 0 || start + overlapWords < words.length);
      start += wordsPerChunk - overlapWords
    ) {
      const text = words.slice(start, start + wordsPerChunk).join(' ');
      if (text.length === 0) continue;
      chunks.push({
        pageStart: page.pageNumber,
        pageEnd: page.pageNumber,
        text,
        checksum: checksum(page.pageNumber, text)
      });
    }
  }
  return chunks;
}

function assertOptions(wordsPerChunk: number, overlapWords: number): void {
  if (!Number.isInteger(wordsPerChunk) || wordsPerChunk < 1 || wordsPerChunk > 1_000)
    throw new RangeError('wordsPerChunk must be an integer between 1 and 1000.');
  if (!Number.isInteger(overlapWords) || overlapWords < 0 || overlapWords >= wordsPerChunk)
    throw new RangeError('overlapWords must be a nonnegative integer smaller than wordsPerChunk.');
}

function checksum(pageNumber: number, text: string): string {
  return createHash('sha256').update(`${pageNumber}\u0000${text}`, 'utf8').digest('hex');
}
