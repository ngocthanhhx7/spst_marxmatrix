/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest';
import { CitationFirewall } from './citation-firewall.js';
import { LocalVectorRepository } from './local-vector-repository.js';
import { RagService } from './rag.service.js';

const requesterId = '507f1f77bcf86cd799439011';
const corpusOwnerId = '507f1f77bcf86cd799439012';
const documentId = '507f1f77bcf86cd799439013';

describe('RagService', () => {
  it('retrieves only the resolver-approved current course corpus and validates its citation', async () => {
    const vectors = new LocalVectorRepository([
      {
        id: '507f1f77bcf86cd799439014',
        ownerId: corpusOwnerId,
        courseId: 'MLN112',
        documentId,
        parseToken: 'current-token',
        pageStart: 2,
        pageEnd: 2,
        text: 'Giá trị thặng dư là phần giá trị mới vượt quá giá trị sức lao động.',
        checksum: 'a'.repeat(64),
        embedding: [1, 0]
      },
      {
        id: '507f1f77bcf86cd799439015',
        ownerId: corpusOwnerId,
        courseId: 'MLN112',
        documentId,
        parseToken: 'stale-token',
        pageStart: 2,
        pageEnd: 2,
        text: 'Nguồn cũ không được dùng.',
        checksum: 'b'.repeat(64),
        embedding: [1, 0]
      }
    ]);
    let queryEmbeddingCalled = false;
    const service = new RagService(
      vectors,
      {
        embed: async () => [1, 0],
        embedQuery: async () => {
          queryEmbeddingCalled = true;
          return [1, 0];
        }
      },
      {
        generate: async (_input, context) => ({
          mode: 'query',
          answer: context[0]?.text ?? 'Không có nguồn.',
          simulated: true,
          claims: [{ text: 'Một luận điểm.', citationIndexes: [0] }],
          citations: [
            {
              chunkId: context[0]?.id ?? '507f1f77bcf86cd799439016',
              documentId,
              pageStart: 2,
              pageEnd: 2,
              quote: 'Giá trị thặng dư'
            }
          ],
          warning: null
        })
      },
      new CitationFirewall(),
      {
        resolve: async () => ({
          ownerId: corpusOwnerId,
          documentParseTokens: [{ documentId, parseToken: 'current-token' }]
        })
      }
    );

    const response = await service.query(requesterId, {
      courseId: 'MLN112',
      documentIds: [documentId],
      mode: 'query',
      question: 'Giá trị thặng dư là gì?'
    });

    expect(response.warning).toBeNull();
    expect(response.citations[0]?.chunkId).toBe('507f1f77bcf86cd799439014');
    expect(queryEmbeddingCalled).toBe(true);
  });
});
