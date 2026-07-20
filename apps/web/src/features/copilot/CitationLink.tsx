import { Link } from 'react-router';
import type { Citation } from './copilot.types.js';

export function citationHref(citation: Citation, sessionId: string) {
  return `/documents/${citation.documentId}/pages/${citation.pageStart}?${new URLSearchParams({ citation: citation.chunkId, source: 'copilot', session: sessionId }).toString()}`;
}
export function CitationLink({
  citation,
  sessionId,
  compact = false
}: {
  citation: Citation;
  sessionId: string;
  compact?: boolean;
}) {
  const label =
    citation.pageStart === citation.pageEnd
      ? `Mở nguồn · trang ${citation.pageStart}`
      : `Mở nguồn · trang ${citation.pageStart}–${citation.pageEnd}`;
  return (
    <Link
      className="copilot__citation-link"
      to={citationHref(citation, sessionId)}
      aria-label={compact ? `Trích dẫn trang ${citation.pageStart}` : label}
    >
      {compact ? `[${citation.pageStart}]` : label}
    </Link>
  );
}
