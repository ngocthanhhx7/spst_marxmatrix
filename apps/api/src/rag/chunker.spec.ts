import { describe, expect, it } from 'vitest';
import { mln112DemoPages } from '../../../../fixtures/course/mln112-demo-pages.js';
import { chunkDocumentPages } from './chunker.js';

describe('chunkDocumentPages', () => {
  it('keeps chunks inside their source page and carries bounded word overlap', () => {
    const chunks = chunkDocumentPages(
      [
        { pageNumber: 1, text: 'một hai ba bốn năm sáu bảy tám' },
        { pageNumber: 2, text: 'chín mười một hai' }
      ],
      { wordsPerChunk: 4, overlapWords: 1 }
    );

    expect(chunks.map((chunk) => [chunk.pageStart, chunk.pageEnd, chunk.text])).toEqual([
      [1, 1, 'một hai ba bốn'],
      [1, 1, 'bốn năm sáu bảy'],
      [1, 1, 'bảy tám'],
      [2, 2, 'chín mười một hai']
    ]);
  });

  it('uses a checksum stable across repeated chunking and rejects duplicate pages', () => {
    const pages = [{ pageNumber: 3, text: 'lao động cụ thể và lao động trừu tượng' }];

    expect(chunkDocumentPages(pages)).toEqual(chunkDocumentPages(pages));
    expect(() => chunkDocumentPages([...pages, ...pages])).toThrow('unique page numbers');
  });

  it('indexes only project-authored MLN112 demo fixture text in the demo test flow', () => {
    const chunks = chunkDocumentPages(mln112DemoPages, { wordsPerChunk: 100, overlapWords: 0 });

    expect(chunks).toHaveLength(3);
    expect(chunks[1]?.text).toContain('Giá trị thặng dư');
  });
});
