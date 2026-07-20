/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest';
import { CitationFirewall } from './citation-firewall.js';
import { LocalVectorRepository } from './local-vector-repository.js';
import { RagService } from './rag.service.js';
import { PERSONAL_COPILOT_COURSE_ID } from '@marxmatrix/contracts';

const requesterId = '507f1f77bcf86cd799439011';
const corpusOwnerId = '507f1f77bcf86cd799439012';
const documentId = '507f1f77bcf86cd799439013';

describe('RagService', () => {
  it('queries only the authenticated owner private Copilot scope', async () => {
    const resolve = async (owner: string, ids: readonly string[]) => ({
      ownerId: owner,
      courseId: PERSONAL_COPILOT_COURSE_ID,
      documentParseTokens: ids.map((id) => ({ documentId: id, parseToken: 'private-v1' }))
    });
    const service = new RagService(
      new LocalVectorRepository([
        {
          id: '507f1f77bcf86cd799439014',
          ownerId: requesterId,
          courseId: PERSONAL_COPILOT_COURSE_ID,
          documentId,
          parseToken: 'private-v1',
          pageStart: 1,
          pageEnd: 1,
          text: 'Riêng tư.',
          checksum: 'c'.repeat(64),
          embedding: [1, 0]
        }
      ]),
      { embed: async () => [1, 0] },
      {
        generate: async () => ({
          mode: 'query',
          answer: 'Riêng tư.',
          simulated: true,
          claims: [{ text: 'Riêng tư.', citationIndexes: [0] }],
          citations: [
            {
              chunkId: '507f1f77bcf86cd799439014',
              documentId,
              pageStart: 1,
              pageEnd: 1,
              quote: 'Riêng tư.'
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
      },
      { resolve }
    );
    await expect(
      service.queryPrivate(requesterId, {
        documentIds: [documentId],
        mode: 'query',
        question: 'Nội dung?'
      })
    ).resolves.toMatchObject({ answer: 'Riêng tư.' });
  });
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
      },
      {
        resolve: async () => ({
          ownerId: requesterId,
          courseId: PERSONAL_COPILOT_COURSE_ID,
          documentParseTokens: [{ documentId, parseToken: 'private-token' }]
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
