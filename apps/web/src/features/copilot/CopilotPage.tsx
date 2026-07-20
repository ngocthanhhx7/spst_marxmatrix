import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocation } from 'react-router';
import { copilotApi, type RagMode, type RagResponse } from './copilot.api.js';
import type { PrivateCopilotDocument } from './copilot.types.js';
import { CitationLink } from './CitationLink.js';
import { createCitationWorkspace, getCitationWorkspace } from './citation-workspace.js';
import './CopilotPage.css';

function documentStatusMessage(document: PrivateCopilotDocument): string {
  if (document.status === 'ready') return `${document.pageCount} trang · sẵn sàng truy xuất`;
  if (document.status !== 'failed') return 'Đang xử lý · chưa thể truy xuất';
  switch (document.errorCode) {
    case 'OCR_UNSUPPORTED':
      return 'PDF quét ảnh chưa có lớp chữ tìm kiếm · hãy chạy OCR hoặc dùng PDF văn bản.';
    case 'PDF_PARSE_FAILED':
      return 'PDF có thể được bảo vệ hoặc không tương thích · hãy xuất lại tệp không mật khẩu.';
    case 'EMBEDDING_FAILED':
      return 'Không thể lập chỉ mục nguồn · hãy thử lại sau hoặc liên hệ quản trị viên.';
    default:
      return 'Không thể xử lý tài liệu · hãy thử lại bằng tệp khác.';
  }
}

function CitationRail({
  response,
  sessionId
}: {
  response: RagResponse | undefined;
  sessionId: string | undefined;
}) {
  return (
    <aside className="copilot__rail copilot__verification" aria-label="Kiểm chứng trích dẫn">
      <p className="copilot__index">KIỂM CHỨNG TRÍCH DẪN</p>
      {response === undefined && (
        <p className="copilot__muted">Gửi một câu hỏi để xem bằng chứng được hệ thống trả về.</p>
      )}
      {response?.warning && (
        <p className="copilot__alert" role="alert">
          {response.warning}
        </p>
      )}
      {response?.citations.length === 0 && !response?.warning && (
        <p className="copilot__muted">
          Chưa có trích dẫn được trả về. MarxMatrix không tự tạo citation.
        </p>
      )}
      {response !== undefined &&
        sessionId !== undefined &&
        response.citations.map((citation, index) => (
          <article className="copilot__citation" key={citation.chunkId}>
            <p>
              TRÍCH DẪN {String(index + 1).padStart(2, '0')} · TRANG {citation.pageStart}
              {citation.pageEnd !== citation.pageStart ? `–${citation.pageEnd}` : ''}
            </p>
            <blockquote>{citation.quote}</blockquote>
            <CitationLink citation={citation} sessionId={sessionId} />
            <button type="button" disabled title="Chức năng báo sai lệch chưa có API xử lý">
              Báo sai lệch
            </button>
          </article>
        ))}
      <div className="copilot__terms">
        <p>RELATED TERMS</p>
        <span>nguồn</span>
        <span>giả định</span>
        <span>kiểm chứng</span>
      </div>
    </aside>
  );
}

function Answer({ response, sessionId }: { response: RagResponse; sessionId: string }) {
  return (
    <article className="copilot__answer" aria-live="polite">
      <p className="copilot__index">PHẢN HỒI CÓ CĂN CỨ</p>
      {response.warning ? (
        <p className="copilot__alert" role="alert">
          {response.warning}
        </p>
      ) : (
        <>
          <p className="copilot__answer-copy">{response.answer}</p>
          {response.claims.length > 0 && (
            <ol>
              {response.claims.map((claim, index) => (
                <li key={`${claim.text}-${index}`}>
                  {claim.text}{' '}
                  {claim.citationIndexes.map((citationIndex) => {
                    const citation = response.citations[citationIndex];
                    return citation === undefined ? null : (
                      <CitationLink
                        key={citation.chunkId}
                        citation={citation}
                        sessionId={sessionId}
                        compact
                      />
                    );
                  })}
                </li>
              ))}
            </ol>
          )}
          <p className="copilot__confidence">
            CONFIDENCE: chỉ phản ánh số trích dẫn được API trả về; hãy mở nguồn để đối chiếu.
          </p>
        </>
      )}
    </article>
  );
}

export function CopilotPage() {
  const location = useLocation();
  const restored = getCitationWorkspace(new URLSearchParams(location.search).get('session'));
  const [mode] = useState<RagMode>(restored?.input.mode ?? 'query');
  const [question, setQuestion] = useState(restored?.input.question ?? '');
  const [selected, setSelected] = useState<string[]>(restored?.input.documentIds ?? []);
  const [sessionId, setSessionId] = useState<string | undefined>(restored?.id);
  const [notice, setNotice] = useState<string | undefined>();
  const [uploadFile, setUploadFile] = useState<File | undefined>();
  const documents = useQuery({
    queryKey: ['rag-documents', 'MLN112'],
    queryFn: copilotApi.availableDocuments,
    retry: false
  });
  const privateDocuments = useQuery({
    queryKey: ['copilot-private-documents'],
    queryFn: copilotApi.privateDocuments,
    retry: false,
    refetchInterval: (query) =>
      Array.isArray(query.state.data) &&
      query.state.data.some((document) =>
        ['uploaded', 'parsing', 'embedding'].includes(document.status)
      )
        ? 3000
        : false
  });
  const upload = useMutation({
    mutationFn: copilotApi.uploadDocument,
    onSuccess: async () => {
      setUploadFile(undefined);
      setNotice('Đã nhận tài liệu. Hệ thống đang trích xuất và lập chỉ mục.');
      await privateDocuments.refetch();
    },
    onError: () => setNotice('Chưa thể tải tài liệu lên. Vui lòng kiểm tra PDF và thử lại.')
  });
  const remove = useMutation({
    mutationFn: copilotApi.deleteDocument,
    onSuccess: async (_result, documentId) => {
      setSelected((items) => items.filter((id) => id !== documentId));
      await privateDocuments.refetch();
    }
  });
  const ask = useMutation({
    mutationFn: (
      input:
        | {
            scope: 'course';
            courseId: string;
            documentIds: string[];
            mode: RagMode;
            question: string;
          }
        | { scope: 'private'; documentIds: string[]; mode: RagMode; question: string }
    ) => (input.scope === 'private' ? copilotApi.askPrivate(input) : copilotApi.ask(input)),
    onSuccess: (response, input) => setSessionId(createCitationWorkspace({ input, response }))
  });
  const response = restored?.response ?? ask.data;
  const activeSession = restored?.id ?? sessionId;
  const privateDocumentList = Array.isArray(privateDocuments.data)
    ? privateDocuments.data.filter((document) => typeof document.status === 'string')
    : [];
  const privateDocumentIds = new Set(privateDocumentList.map((document) => document.id));
  const selectedPrivate = selected.filter((id) => privateDocumentIds.has(id));
  const selectedCourse = selected.filter((id) => !privateDocumentIds.has(id));
  const selectedPrivateNotReady = privateDocumentList.some(
    (document) => selectedPrivate.includes(document.id) && document.status !== 'ready'
  );

  function submit() {
    const trimmed = question.trim();
    if (!trimmed) {
      setNotice('Hãy nhập câu hỏi cho Copilot trước khi gửi.');
      return;
    }
    if (!selected.length) {
      setNotice('Hãy chọn ít nhất một tài liệu nguồn trước khi gửi.');
      return;
    }
    if (selectedPrivate.length > 0 && selectedCourse.length > 0) {
      setNotice('Hãy chọn tài liệu khóa học hoặc tài liệu riêng, không trộn hai phạm vi.');
      return;
    }
    if (selectedPrivateNotReady) {
      setNotice('Tài liệu riêng chưa sẵn sàng để truy xuất.');
      return;
    }
    setNotice(undefined);
    setSessionId(undefined);
    if (selectedPrivate.length > 0)
      ask.mutate({ scope: 'private', documentIds: selectedPrivate, mode, question: trimmed });
    else
      ask.mutate({
        scope: 'course',
        courseId: 'MLN112',
        documentIds: selectedCourse,
        mode,
        question: trimmed
      });
  }
  function cancel() {
    setQuestion('');
    setNotice('Đã xoá nội dung đang soạn.');
  }

  return (
    <section className="copilot" aria-label="Không gian Copilot">
      <header className="copilot__header">
        <p className="copilot__index">MLN212 / WORKSPACE</p>
        <h1 id="copilot-title">Copilot bằng chứng</h1>
        <p>Phản hồi chỉ dựa trên các tài liệu bạn chọn và citation do hệ thống trả về.</p>
      </header>
      <div className="copilot__workspace">
        <section className="copilot__rail copilot__sources" aria-label="Nguồn tài liệu">
          <div className="copilot__rail-heading">
            <p className="copilot__index">NGUỒN TÀI LIỆU</p>
            <span>{selected.length} tài liệu đã chọn</span>
          </div>
          <label className="copilot__search">
            Tìm trong nguồn
            <input
              id="copilot-source-query"
              name="source-query"
              type="search"
              placeholder="Tìm tài liệu"
              disabled={documents.isLoading || documents.isError}
            />
          </label>
          <form
            className="copilot__upload"
            onSubmit={(event) => {
              event.preventDefault();
              if (uploadFile === undefined) {
                setNotice('Chọn một tệp PDF trước khi tải lên.');
                return;
              }
              setNotice(undefined);
              upload.mutate({ file: uploadFile, title: uploadFile.name.replace(/\.pdf$/i, '') });
            }}
          >
            <label htmlFor="copilot-upload-file">Tải tài liệu lên Copilot</label>
            <input
              id="copilot-upload-file"
              type="file"
              accept="application/pdf,.pdf"
              onChange={(event) => setUploadFile(event.target.files?.[0])}
            />
            <button type="submit" disabled={upload.isPending || uploadFile === undefined}>
              {upload.isPending ? 'Đang tải lên…' : 'Tải tài liệu lên'}
            </button>
            <p className="copilot__muted">PDF riêng tư · chỉ tài khoản của bạn được truy xuất.</p>
          </form>
          {privateDocuments.isError && (
            <p className="copilot__alert" role="alert">
              Không thể tải danh sách tài liệu riêng.
            </p>
          )}
          {privateDocumentList.length > 0 && (
            <div className="copilot__private-sources">
              <p className="copilot__index">TÀI LIỆU RIÊNG</p>
              {privateDocumentList.map((document: PrivateCopilotDocument) => {
                const ready = document.status === 'ready';
                return (
                  <div className="copilot__private-row" key={document.id}>
                    <label
                      className="copilot__source-row"
                      data-selected={selected.includes(document.id)}
                      data-ready={ready}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(document.id)}
                        disabled={!ready}
                        onChange={() =>
                          setSelected((items) =>
                            items.includes(document.id)
                              ? items.filter((id) => id !== document.id)
                              : [...items, document.id]
                          )
                        }
                      />
                      <span className="copilot__source-copy">
                        <strong>{document.title}</strong>
                        <small>{documentStatusMessage(document)}</small>
                      </span>
                    </label>
                    <button
                      type="button"
                      className="copilot__private-delete"
                      aria-label={`Xóa ${document.title}`}
                      disabled={remove.isPending}
                      onClick={() => remove.mutate(document.id)}
                    >
                      Xóa
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {documents.isLoading && <p className="copilot__muted">Đang tải danh sách tài liệu…</p>}
          {documents.isError && (
            <>
              <p className="copilot__alert" role="alert">
                Không thể tải danh sách tài liệu để truy xuất.
              </p>
              <p className="copilot__muted">Chưa có tài liệu nào để truy xuất.</p>
            </>
          )}
          {documents.data?.length === 0 && (
            <p className="copilot__muted">Chưa có tài liệu nào để truy xuất.</p>
          )}
          <div className="copilot__source-list" aria-label="Tài liệu khóa học">
            {documents.data?.map((document) => (
              <label
                className="copilot__source-row"
                data-selected={selected.includes(document.id)}
                key={document.id}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(document.id)}
                  onChange={() =>
                    setSelected((items) =>
                      items.includes(document.id)
                        ? items.filter((id) => id !== document.id)
                        : [...items, document.id]
                    )
                  }
                />
                <span>
                  <strong>{document.title}</strong>
                  <small>{document.pageCount} trang · sẵn sàng truy xuất</small>
                </span>
              </label>
            ))}
          </div>
        </section>
        <section className="copilot__conversation" aria-label="Copilot bằng chứng">
          <div className="copilot__conversation-heading">
            <p className="copilot__index">COPILOT BẰNG CHỨNG</p>
            <span>{ask.isPending ? 'ĐANG TRUY XUẤT' : 'SCOPE / MLN112'}</span>
          </div>
          {!response && !ask.isPending && (
            <div className="copilot__empty">
              <p>Đặt một câu hỏi về học liệu. Chọn nguồn trước để giới hạn phạm vi truy xuất.</p>
            </div>
          )}
          {ask.isPending && (
            <div className="copilot__loading" role="status">
              Đang truy xuất các trang học liệu liên quan…
            </div>
          )}
          {ask.isError && (
            <div className="copilot__alert" role="alert">
              Không thể truy xuất phản hồi có căn cứ. Nội dung học liệu không thay đổi.
            </div>
          )}
          {response && activeSession && <Answer response={response} sessionId={activeSession} />}
          <form
            className="copilot__composer"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label htmlFor="copilot-question">Câu hỏi cho Copilot</label>
            <textarea
              id="copilot-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Đặt câu hỏi dựa trên học liệu đã chọn…"
            />
            <div>
              <button type="button" onClick={cancel}>
                Huỷ
              </button>
              <button type="submit" disabled={ask.isPending || selectedPrivateNotReady}>
                {ask.isPending ? 'Đang gửi…' : 'Gửi câu hỏi'}
              </button>
            </div>
            {notice && (
              <p className="copilot__alert" role="alert">
                {notice}
              </p>
            )}
          </form>
        </section>
        <CitationRail response={response} sessionId={activeSession} />
      </div>
    </section>
  );
}
