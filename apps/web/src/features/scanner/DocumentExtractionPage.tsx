import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DocumentMetadata } from '@marxmatrix/contracts';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageState } from '../../shared/ui/PageState.js';
import { documentExtractionApi } from './document-extraction.api.js';
import './DocumentExtractionPage.css';

const formatValue = (value: number, currency: string, scale: string) =>
  `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value)} ${currency} (${scale})`;

const statusLabel: Record<DocumentMetadata['status'], string> = {
  uploaded: 'Đã tải lên',
  parsing: 'Đang đọc PDF',
  parsed: 'Đã đọc PDF',
  embedding: 'Đang lập chỉ mục',
  ready: 'Sẵn sàng',
  failed: 'Lỗi xử lý'
};
const isDocumentExtractionAvailable = (status: DocumentMetadata['status']) =>
  status === 'parsed' || status === 'embedding' || status === 'ready';
const isDocumentProcessing = (status: DocumentMetadata['status'] | undefined) =>
  status === 'uploaded' || status === 'parsing' || status === 'embedding';

export function DocumentExtractionPage() {
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>();
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string>();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File>();
  const [uploadError, setUploadError] = useState<string>();
  const queryClient = useQueryClient();
  const documents = useQuery({
    queryKey: ['documents'],
    queryFn: documentExtractionApi.listDocuments,
    refetchInterval: (query) =>
      query.state.data?.some((document) => isDocumentProcessing(document.status)) ? 3000 : false
  });
  const analyses = useQuery({
    queryKey: ['analyses-for-extraction'],
    queryFn: documentExtractionApi.listAnalyses,
    enabled: selectedDocumentId !== undefined
  });
  const selectedDocument = documents.data?.find((document) => document.id === selectedDocumentId);
  const extractions = useQuery({
    queryKey: ['document-extractions', selectedDocumentId],
    enabled: selectedDocumentId !== undefined,
    queryFn: () => documentExtractionApi.listExtractions(selectedDocumentId!),
    refetchInterval: isDocumentProcessing(selectedDocument?.status) ? 3000 : false
  });
  const upload = useMutation({
    mutationFn: documentExtractionApi.uploadDocument,
    onSuccess: async (document) => {
      setTitle('');
      setFile(undefined);
      setUploadError(undefined);
      setSelectedDocumentId(document.id);
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: () => setUploadError('Chưa thể tải PDF lên. Vui lòng thử lại.')
  });
  const queueExtraction = useMutation({
    mutationFn: ({ documentId, analysisId }: { documentId: string; analysisId: string }) =>
      documentExtractionApi.queueExtraction(documentId, analysisId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['document-extractions', selectedDocumentId]
      });
    }
  });
  const submitUpload = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (title.trim().length === 0)
      return setUploadError('Nhập tiêu đề tài liệu trước khi tải lên.');
    if (file === undefined) return setUploadError('Chọn một tệp PDF trước khi tải lên.');
    if (file.type !== 'application/pdf') return setUploadError('Chỉ chấp nhận tệp PDF.');
    setUploadError(undefined);
    upload.mutate({ title: title.trim(), file });
  };

  return (
    <section
      className="scanner-page extraction-page extraction-workspace"
      aria-labelledby="extraction-page-title"
    >
      <p className="eyebrow">SCANNER / AI EVIDENCE</p>
      <h1 id="extraction-page-title">Trích xuất bằng chứng từ tài liệu</h1>
      <p>
        Chọn một PDF của bạn để xem các số liệu AI đề xuất. Mọi số liệu mới đều ở trạng thái chờ
        duyệt và luôn kèm bằng chứng nguồn.
      </p>
      <Link className="text-link" to="/scanner">
        ← Quay lại lịch sử Scanner
      </Link>
      <aside className="extraction-progress" aria-label="Pipeline trích xuất">
        <p>TIẾN TRÌNH / KHÔNG TỰ DUYỆT</p>
        <ol>
          <li data-active="true">
            <span>01</span> Tải tệp và đọc PDF
          </li>
          <li data-active={selectedDocumentId !== undefined ? 'true' : 'false'}>
            <span>02</span> Chọn phân tích đích
          </li>
          <li data-active={queueExtraction.isSuccess ? 'true' : 'false'}>
            <span>03</span> AI đề xuất evidence
          </li>
          <li
            data-active={
              queueExtraction.isSuccess || (extractions.data?.facts.length ?? 0) > 0
                ? 'true'
                : 'false'
            }
          >
            <span>04</span> Người học duyệt fact
          </li>
        </ol>
        <p>
          {queueExtraction.isSuccess
            ? 'Ứng viên đã vào hàng đợi; chưa có fact nào được tự động áp dụng.'
            : selectedDocument && isDocumentProcessing(selectedDocument.status)
              ? 'PDF đang được xử lý. Màn hình sẽ tự làm mới khi trạng thái thay đổi.'
              : 'AI chỉ tạo đề xuất; bạn quyết định fact nào được đưa vào phân tích.'}
        </p>
      </aside>
      <form className="document-upload" noValidate onSubmit={submitUpload}>
        <h2>Tải báo cáo PDF</h2>
        <label>
          Tiêu đề tài liệu
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          Loại tài liệu
          <input value="Báo cáo tài chính" disabled aria-label="Loại tài liệu" />
        </label>
        <label>
          Chọn tệp PDF
          <input
            type="file"
            accept="application/pdf"
            onChange={(event) => setFile(event.target.files?.[0])}
          />
        </label>
        <button disabled={upload.isPending}>
          {upload.isPending ? 'Đang tải PDF…' : 'Tải PDF lên'}
        </button>
        {uploadError && <p role="alert">{uploadError}</p>}
        {upload.isSuccess && (
          <p className="upload-success">Đã tải PDF lên. Đang chờ xử lý an toàn.</p>
        )}
      </form>

      {documents.isLoading && <PageState>Đang tải tài liệu của bạn…</PageState>}
      {documents.isError && (
        <PageState>
          <p>Chưa thể tải tài liệu.</p>
          <button onClick={() => void documents.refetch()}>Thử lại</button>
        </PageState>
      )}
      {documents.data?.length === 0 && (
        <PageState>
          <p>Chưa có PDF nào để trích xuất.</p>
          <span className="status-badge status-simulated">AI mô phỏng</span>
          <p>Hãy tải báo cáo PDF lên trước; màn hình này sẽ hiển thị bằng chứng sau khi xử lý.</p>
        </PageState>
      )}
      {documents.data && documents.data.length > 0 && (
        <div className="extraction-layout">
          <ol className="document-list" aria-label="Tài liệu PDF">
            {documents.data.map((document) => (
              <li key={document.id}>
                <button
                  className={
                    document.id === selectedDocumentId
                      ? 'document-choice is-selected'
                      : 'document-choice'
                  }
                  onClick={() => setSelectedDocumentId(document.id)}
                >
                  <strong>{document.title}</strong>
                  <small>{document.originalFileName}</small>
                  <span className={`status-badge status-${document.status}`}>
                    {statusLabel[document.status]}
                  </span>
                </button>
              </li>
            ))}
          </ol>
          <div className="extraction-result" aria-live="polite">
            {selectedDocument === undefined && (
              <PageState>Chọn một tài liệu để xem kết quả AI.</PageState>
            )}
            {selectedDocument !== undefined &&
              !isDocumentExtractionAvailable(selectedDocument.status) && (
                <PageState>
                  <span className="status-badge status-simulated">AI mô phỏng</span>
                  <p>
                    PDF chưa sẵn sàng để trích xuất. Trạng thái hiện tại:{' '}
                    {statusLabel[selectedDocument.status]}.
                  </p>
                  {selectedDocument.errorMessage && (
                    <p role="alert">{selectedDocument.errorMessage}</p>
                  )}
                </PageState>
              )}
            {selectedDocument && isDocumentExtractionAvailable(selectedDocument.status) && (
              <div className="extraction-trigger">
                <label>
                  Phân tích đích
                  <select
                    value={selectedAnalysisId ?? ''}
                    onChange={(event) => setSelectedAnalysisId(event.target.value || undefined)}
                  >
                    <option value="">Chọn một phân tích</option>
                    {(analyses.data ?? []).map((analysis) => (
                      <option key={analysis.id} value={analysis.id}>
                        {analysis.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  disabled={selectedAnalysisId === undefined || queueExtraction.isPending}
                  onClick={() => {
                    if (selectedAnalysisId !== undefined)
                      queueExtraction.mutate({
                        documentId: selectedDocument.id,
                        analysisId: selectedAnalysisId
                      });
                  }}
                >
                  {queueExtraction.isPending ? 'Đang xếp hàng…' : 'Bắt đầu trích xuất AI'}
                </button>
                {queueExtraction.isSuccess && (
                  <div className="extraction-queued" role="status">
                    <p>
                      Đã xếp hàng trích xuất; AI chỉ đề xuất evidence để bạn duyệt, không tự áp dụng
                      vào phân tích.
                    </p>
                    <Link
                      className="button-link"
                      to={`/scanner/${selectedAnalysisId}?focus=pending`}
                    >
                      Mở hàng chờ duyệt
                    </Link>
                  </div>
                )}
                {queueExtraction.isError && <p role="alert">Không thể xếp hàng trích xuất.</p>}
              </div>
            )}
            {selectedDocument &&
              isDocumentExtractionAvailable(selectedDocument.status) &&
              extractions.isLoading && <PageState>Đang tải số liệu trích xuất…</PageState>}
            {selectedDocument &&
              isDocumentExtractionAvailable(selectedDocument.status) &&
              extractions.isError && (
                <PageState>
                  <span className="status-badge status-unavailable">AI chưa khả dụng</span>
                  <p>Chưa thể lấy kết quả trích xuất. Dữ liệu nguồn vẫn được giữ nguyên.</p>
                  <button onClick={() => void extractions.refetch()}>Thử lại</button>
                </PageState>
              )}
            {selectedDocument &&
              isDocumentExtractionAvailable(selectedDocument.status) &&
              extractions.data?.facts.length === 0 && (
                <PageState>
                  <p>Chưa tìm thấy số liệu để đề xuất từ tài liệu này.</p>
                  {extractions.data.simulated === true && (
                    <span className="status-badge status-simulated">AI mô phỏng</span>
                  )}
                </PageState>
              )}
            {selectedDocument &&
              isDocumentExtractionAvailable(selectedDocument.status) &&
              extractions.data &&
              extractions.data.facts.length > 0 && (
                <>
                  {extractions.data.simulated === true && (
                    <span className="status-badge status-simulated">AI mô phỏng</span>
                  )}
                  {extractions.data.simulated === false && (
                    <span className="status-badge status-live">AI đã cấu hình</span>
                  )}
                  <ol className="extraction-facts" aria-label="Số liệu AI đề xuất">
                    {extractions.data.facts.map((fact) => (
                      <li key={fact.id}>
                        <div>
                          <strong>{fact.label}</strong>
                          <span className="status-badge status-pending">Chờ duyệt</span>
                        </div>
                        <p>{formatValue(fact.value, fact.currency, fact.scale)}</p>
                        <small>
                          {fact.reportingPeriod} · Phân loại đề xuất: {fact.classification}
                        </small>
                        <blockquote>
                          {fact.sourcePage !== null && <cite>Trang {fact.sourcePage}</cite>}
                          <p>{fact.evidenceText ?? 'Chưa có đoạn bằng chứng.'}</p>
                        </blockquote>
                      </li>
                    ))}
                  </ol>
                  {selectedAnalysisId && (
                    <Link
                      className="text-link extraction-review-link"
                      to={`/scanner/${selectedAnalysisId}?focus=pending`}
                    >
                      Mở hàng chờ duyệt
                    </Link>
                  )}
                </>
              )}
          </div>
        </div>
      )}
    </section>
  );
}
