import { describe, expect, it, vi } from 'vitest';
import { MongoCourseCorpusScopeResolver } from './course-corpus-scope.resolver.js';

const documentId = '507f1f77bcf86cd799439011';
const ownerId = '507f1f77bcf86cd799439012';

describe('MongoCourseCorpusScopeResolver', () => {
  it('selects the committed parse token for course scope and source pages', async () => {
    const select = vi.fn().mockResolvedValue([
      {
        _id: { toString: () => documentId },
        ownerId: { toString: () => ownerId },
        parsedPageToken: 'parse-v1'
      }
    ]);
    const pageSelect = vi.fn().mockResolvedValue({
      _id: { toString: () => documentId },
      ownerId: { toString: () => ownerId },
      parsedPageToken: 'parse-v1'
    });
    const findOne = vi.fn().mockReturnValue({ select: pageSelect });
    const pages = {
      findOne: vi.fn().mockResolvedValue({
        pageNumber: 1,
        text: 'synthetic course text',
        sourceChunkIds: []
      })
    };
    const resolver = new MongoCourseCorpusScopeResolver(
      {
        find: vi.fn().mockReturnValue({ select }),
        findOne
      } as never,
      pages as never
    );

    await expect(resolver.resolve('MLN112', [documentId])).resolves.toMatchObject({
      ownerId,
      documentParseTokens: [{ documentId, parseToken: 'parse-v1' }]
    });
    await expect(resolver.page(documentId, 1, 'MLN112')).resolves.toMatchObject({
      documentId,
      pageNumber: 1,
      text: 'synthetic course text'
    });
    expect(select).toHaveBeenCalledWith('+parsedPageToken');
    expect(pageSelect).toHaveBeenCalledWith('+parsedPageToken');
  });
});
