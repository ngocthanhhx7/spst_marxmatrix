import { describe, expect, it } from 'vitest';
import { CitationFirewall, RAG_INSUFFICIENT_EVIDENCE_WARNING } from './citation-firewall.js';

const ownerId = '507f1f77bcf86cd799439011';
const documentId = '507f1f77bcf86cd799439012';
const chunkId = '507f1f77bcf86cd799439013';
const retrieved = [
  {
    id: chunkId,
    ownerId,
    courseId: 'MLN112',
    documentId,
    parseToken: 'token',
    pageStart: 4,
    pageEnd: 5,
    text: 'Giá trị thặng dư là phần giá trị mới dôi ra ngoài giá trị sức lao động.',
    checksum: 'a'.repeat(64),
    embedding: [1, 0],
    score: 1
  }
];

describe('CitationFirewall', () => {
  it.each([
    ['a nonexistent chunk', '507f1f77bcf86cd799439014', documentId, 4, 4],
    ['an unretrieved chunk', '507f1f77bcf86cd799439015', documentId, 4, 4],
    ['a wrong document', chunkId, '507f1f77bcf86cd799439014', 4, 4],
    ['an out of range page', chunkId, documentId, 3, 4]
  ])(
    'returns Vietnamese insufficiency warning for %s',
    (_label, citedChunkId, citedDocumentId, pageStart, pageEnd) => {
      const response = new CitationFirewall().validate(
        {
          mode: 'query',
          answer: 'Câu trả lời không được chống lưng.',
          simulated: true,
          claims: [{ text: 'Một nhận định.', citationIndexes: [0] }],
          citations: [
            {
              chunkId: citedChunkId,
              documentId: citedDocumentId,
              pageStart,
              pageEnd,
              quote: 'Giá trị thặng dư'
            }
          ],
          warning: null
        },
        retrieved,
        { ownerId, courseId: 'MLN112', documentIds: [documentId] }
      );

      expect(response).toMatchObject({
        claims: [],
        citations: [],
        warning: RAG_INSUFFICIENT_EVIDENCE_WARNING
      });
    }
  );

  it('accepts a multi-page citation only when it stays within a retrieved chunk', () => {
    const response = new CitationFirewall().validate(
      {
        mode: 'outline',
        answer: 'Giá trị thặng dư là phần giá trị mới dôi ra ngoài giá trị sức lao động.',
        simulated: true,
        claims: [{ text: 'Một nhận định có nguồn.', citationIndexes: [0] }],
        citations: [
          {
            chunkId,
            documentId,
            pageStart: 4,
            pageEnd: 5,
            quote: 'Giá trị thặng dư'
          }
        ],
        warning: null
      },
      retrieved,
      { ownerId, courseId: 'MLN112', documentIds: [documentId] }
    );

    expect(response.warning).toBeNull();
    expect(response.citations).toHaveLength(1);
  });

  it('rejects an answer that has a valid quote but no grounded claim', () => {
    const response = new CitationFirewall().validate(
      {
        mode: 'query',
        answer: 'Unsupported answer.',
        simulated: true,
        claims: [],
        citations: [
          {
            chunkId,
            documentId,
            pageStart: 4,
            pageEnd: 5,
            quote: 'Giá trị thặng dư'
          }
        ],
        warning: null
      },
      retrieved,
      { ownerId, courseId: 'MLN112', documentIds: [documentId] }
    );

    expect(response).toMatchObject({
      claims: [],
      citations: [],
      warning: RAG_INSUFFICIENT_EVIDENCE_WARNING
    });
  });
});
