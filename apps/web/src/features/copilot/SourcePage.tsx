import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'react-router';
import { apiClient } from '../../shared/api/runtime.js';
import { citationHref } from './CitationLink.js';
import { getCitationWorkspace, getWorkspaceCitation } from './citation-workspace.js';
import './CopilotPage.css';

type DocumentPage = {
  documentId: string;
  pageNumber: number;
  text: string;
  sourceChunkIds: string[];
};

function PageLines({ text, quote }: { text: string; quote: string | undefined }) {
  const highlightedLine =
    quote === undefined ? -1 : text.toLocaleLowerCase().indexOf(quote.toLocaleLowerCase());
  const startLine =
    highlightedLine < 0 ? -1 : text.slice(0, highlightedLine).split('\n').length - 1;
  return (
    <div className="source__page-lines">
      {text.split('\n').map((line, index) => (
        <p key={`${index}-${line}`}>
          <span>{String(index + 1).padStart(2, '0')}</span>
          {index === startLine && quote !== undefined ? (
            <>
              <mark>{quote}</mark>
              {line.slice(quote.length)}
            </>
          ) : (
            line
          )}
        </p>
      ))}
    </div>
  );
}

export function SourcePage() {
  const { documentId, pageNumber } = useParams();
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  const page = Number(pageNumber);
  const sessionId = search.get('session');
  const scope = search.get('scope') === 'private' ? 'private' : 'course';
  const workspace = getCitationWorkspace(sessionId);
  const citation = getWorkspaceCitation(sessionId, search.get('citation'), documentId, page);
  const source = useQuery({
    queryKey: ['document-page', scope, documentId, page],
    enabled: documentId !== undefined && Number.isInteger(page) && page > 0,
    retry: false,
    queryFn: () =>
      apiClient.request<DocumentPage>(
        scope === 'private'
          ? `/documents/${documentId}/pages/${page}`
          : `/rag/documents/${documentId}/pages/${page}?courseId=MLN112`
      )
  });
  const returnTo =
    sessionId === null ? '/copilot' : `/copilot?session=${encodeURIComponent(sessionId)}`;
  const citations =
    workspace?.response.citations.filter((candidate) => candidate.documentId === documentId) ?? [];
  const citationIndex =
    citation === undefined
      ? -1
      : citations.findIndex((candidate) => candidate.chunkId === citation.chunkId);
  const adjacent = (offset: number) =>
    citationIndex < 0 ? undefined : citations[citationIndex + offset];

  return (
    <section className="source" aria-labelledby="source-title">
      <header className="source__header">
        <p className="copilot__index">MLN212 / COPILOT / SOURCE</p>
        <p className="source__breadcrumb">Copilot / session / nguồn học liệu</p>
        <h1 id="source-title">Trang học liệu {Number.isInteger(page) && page > 0 ? page : ''}</h1>
        <div>
          <Link to={returnTo}>← Quay lại Copilot</Link>
          <button type="button" disabled title="API chưa cung cấp tệp gốc">
            Tải bản gốc
          </button>
          <button type="button" disabled title="API chưa cung cấp tệp gốc">
            Mở bản gốc
          </button>
        </div>
      </header>
      {source.isLoading && (
        <p className="source__state" role="status">
          Đang tải trang học liệu…
        </p>
      )}
      {source.isError && (
        <div className="source__state" role="alert">
          <p>Không thể mở trang học liệu này.</p>
          <button type="button" onClick={() => void source.refetch()}>
            Thử lại
          </button>
        </div>
      )}
      {source.data && (
        <div className="source__workspace">
          <article className="source__reader" aria-label="Nội dung trang học liệu">
            <div className="source__reader-head">
              <span>PAGE {String(source.data.pageNumber).padStart(2, '0')}</span>
              <span>TEXT EXTRACTION</span>
            </div>
            <PageLines text={source.data.text} quote={citation?.quote} />
            {citation !== undefined &&
              !source.data.text
                .toLocaleLowerCase()
                .includes(citation.quote.toLocaleLowerCase()) && (
                <p className="source__alignment" role="status">
                  Không thể căn chỉnh chính xác trích dẫn với văn bản trang này.
                </p>
              )}
          </article>
          <aside className="source__rail" aria-label="Trích dẫn đang kiểm chứng">
            <p className="copilot__index">TRÍCH DẪN ĐANG KIỂM CHỨNG</p>
            {citation === undefined ? (
              <p>Không có trích dẫn hợp lệ trong ngữ cảnh này.</p>
            ) : (
              <>
                <blockquote>{citation.quote}</blockquote>
                <dl>
                  <div>
                    <dt>CONFIDENCE</dt>
                    <dd>98%*</dd>
                  </div>
                  <div>
                    <dt>METHOD</dt>
                    <dd>Exact-text match khi văn bản cho phép</dd>
                  </div>
                  <div>
                    <dt>CONTEXT</dt>
                    <dd>
                      Trang {citation.pageStart}
                      {citation.pageEnd !== citation.pageStart ? `–${citation.pageEnd}` : ''} của
                      tài liệu đang chọn
                    </dd>
                  </div>
                </dl>
                <p className="source__footnote">
                  *Giá trị minh hoạ thiết kế; API hiện không trả confidence.
                </p>
                <div className="source__citation-nav">
                  {adjacent(-1) ? (
                    <Link to={citationHref(adjacent(-1)!, sessionId!)}>← Trích dẫn trước</Link>
                  ) : (
                    <span>← Trích dẫn trước</span>
                  )}
                  {adjacent(1) ? (
                    <Link to={citationHref(adjacent(1)!, sessionId!)}>Trích dẫn tiếp →</Link>
                  ) : (
                    <span>Trích dẫn tiếp →</span>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      )}
      <footer className="source__status">
        SYSTEM / nguồn hiển thị từ API RAG · phiên Copilot được giữ trong return context
      </footer>
    </section>
  );
}
