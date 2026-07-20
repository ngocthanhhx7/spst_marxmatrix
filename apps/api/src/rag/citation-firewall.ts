import type { RagResponse, RetrievedChunk } from '@marxmatrix/contracts';

export const RAG_INSUFFICIENT_EVIDENCE_WARNING =
  'Giáo trình hiện có chưa cung cấp đủ căn cứ để khẳng định luận điểm này.';

export interface CitationScope {
  ownerId: string;
  courseId: string;
  documentIds: readonly string[];
}

interface RetrievedChunkWithOwner extends RetrievedChunk {
  ownerId: string;
}

/** Server-owned boundary that removes every answer whose support cannot be proven from this retrieval. */
export class CitationFirewall {
  validate(
    candidate: RagResponse,
    retrieved: readonly RetrievedChunkWithOwner[],
    scope: CitationScope
  ): RagResponse {
    const requestedDocuments = new Set(scope.documentIds);
    const retrievedById = new Map(retrieved.map((chunk) => [chunk.id, chunk]));
    const validCitations = candidate.citations.filter((citation) => {
      const chunk = retrievedById.get(citation.chunkId);
      return (
        chunk !== undefined &&
        chunk.ownerId === scope.ownerId &&
        chunk.courseId === scope.courseId &&
        chunk.documentId === citation.documentId &&
        requestedDocuments.has(citation.documentId) &&
        citation.pageStart >= chunk.pageStart &&
        citation.pageEnd <= chunk.pageEnd &&
        normalized(chunk.text).includes(normalized(citation.quote))
      );
    });
    const claimsReferenceOnlyValidCitations = candidate.claims.every((claim) =>
      claim.citationIndexes.every(
        (citationIndex) =>
          Number.isInteger(citationIndex) &&
          citationIndex >= 0 &&
          citationIndex < validCitations.length
      )
    );
    if (
      validCitations.length !== candidate.citations.length ||
      validCitations.length === 0 ||
      candidate.claims.length === 0 ||
      !claimsReferenceOnlyValidCitations
    )
      return {
        mode: candidate.mode,
        answer: RAG_INSUFFICIENT_EVIDENCE_WARNING,
        simulated: candidate.simulated,
        claims: [],
        citations: [],
        warning: RAG_INSUFFICIENT_EVIDENCE_WARNING
      };
    return { ...candidate, citations: validCitations };
  }
}

function normalized(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('vi-VN');
}
