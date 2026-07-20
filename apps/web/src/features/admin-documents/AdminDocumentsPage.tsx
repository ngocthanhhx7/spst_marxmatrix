import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { PageState } from '../../shared/ui/PageState.js';
import { adminDocumentsApi, type AdminDocument } from './admin-documents.api.js';
import './AdminDocumentsPage.css';

const statusLabel: Record<AdminDocument['status'], string> = {
  uploaded: 'Đã tải lên',
  parsing: 'Đang đọc PDF',
  parsed: 'Đã đọc PDF',
  embedding: 'Đang lập chỉ mục',
  ready: 'Sẵn sàng',
  failed: 'Cần xử lý'
};

const processingStatuses = new Set<AdminDocument['status']>([
  'uploaded',
  'parsing',
  'parsed',
  'embedding'
]);

export function AdminDocumentsPage() {
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File>();
  const [uploadError, setUploadError] = useState<string>();
  const queryClient = useQueryClient();
  const documents = useQuery({
    queryKey: ['admin-documents'],
    queryFn: adminDocumentsApi.list,
    refetchInterval: (query) =>
      query.state.data?.some((document) => processingStatuses.has(document.status)) ? 5000 : false
  });
  const reindex = useMutation({
    mutationFn: adminDocumentsApi.reindex,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['admin-documents'] })
  });
  const upload = useMutation({
    mutationFn: adminDocumentsApi.upload,
    onSuccess: async () => {
      setTitle('');
      setFile(undefined);
      setUploadError(undefined);
      await queryClient.invalidateQueries({ queryKey: ['admin-documents'] });
    },
    onError: () =>
      setUploadError('Không thể tải học liệu lên. Vui lòng kiểm tra tệp PDF và thử lại.')
  });
  const retry = useMutation({
    mutationFn: adminDocumentsApi.retryJob,
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['admin-documents'] })
  });
  return (
    <section
      className="admin-documents-page"
      data-screen="admin-documents-16"
      aria-labelledby="admin-documents-title"
    >
      <nav className="admin-documents-page__ops-nav" aria-label="Operations navigation">
        <strong>
          MARXMATRIX
          <br />
          VẬN HÀNH
        </strong>
        <span>Dashboard</span>
        <span className="is-active">Analysis Jobs</span>
        <span>Node Clusters</span>
        <span>User Access</span>
        <span>Logs</span>
      </nav>
      <aside className="admin-documents-page__dossier" aria-label="Job dossier">
        <p>JOB DOSSIER</p>
        <h2>JOB DOSSIER</h2>
        <p>Chi tiết tác vụ chỉ hiển thị khi API cung cấp metadata.</p>
        <span>Không có lệnh hủy hoặc tải xuống được hỗ trợ.</span>
      </aside>
      <p className="eyebrow">ADMIN / COURSE INGESTION</p>
      <h1 id="admin-documents-title">Học liệu và lập chỉ mục</h1>
      <p>
        Quản lý trạng thái nhập học liệu MLN112. Chỉ chạy lại tác vụ khi trạng thái hoặc lỗi phía
        máy chủ yêu cầu.
      </p>
      <form
        className="document-upload admin-documents-page__upload"
        role="region"
        aria-label="Upload control"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim().length === 0)
            return setUploadError('Nhập tiêu đề học liệu trước khi tải lên.');
          if (file === undefined) return setUploadError('Chọn một tệp PDF trước khi tải lên.');
          if (file.type !== 'application/pdf') return setUploadError('Chỉ chấp nhận tệp PDF.');
          setUploadError(undefined);
          upload.mutate({ title: title.trim(), file });
        }}
      >
        <h2>Nhập học liệu MLN112</h2>
        <label>
          Tiêu đề
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
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
          {upload.isPending ? 'Đang tải lên…' : 'Tải học liệu lên'}
        </button>
        {uploadError && <p role="alert">{uploadError}</p>}
        {upload.isSuccess && (
          <p className="upload-success" role="status">
            Đã tiếp nhận học liệu và xếp hàng xử lý.
          </p>
        )}
      </form>
      {documents.isLoading && <PageState>Đang tải trạng thái nhập học liệu…</PageState>}
      <div className="admin-documents-page__ledger-heading">
        <p>STATUS / EVIDENCE</p>
        <h2>Operations ledger</h2>
        <span aria-live="polite">{documents.data?.length ?? 0} document records</span>
      </div>
      {documents.isError && (
        <PageState>
          <p>Chưa thể tải danh sách học liệu.</p>
          <button onClick={() => void documents.refetch()}>Tải lại</button>
        </PageState>
      )}
      {documents.data?.length === 0 && <PageState>Chưa có học liệu nào được nhập.</PageState>}
      {documents.data && documents.data.length > 0 && (
        <ol className="admin-document-list" aria-label="Sổ trạng thái học liệu MLN112">
          {documents.data.map((document) => {
            const isReindexing = reindex.isPending && reindex.variables === document.id;
            const isRetrying = retry.isPending && retry.variables === document.failedJobId;
            return (
              <li key={document.id}>
                <div>
                  <h2>{document.title}</h2>
                  <p>
                    {document.pageCount} trang · cập nhật{' '}
                    {new Intl.DateTimeFormat('vi-VN').format(new Date(document.updatedAt))}
                  </p>
                  <span className={`status-badge status-${document.status}`}>
                    {statusLabel[document.status]}
                  </span>
                  {document.errorMessage && <p role="alert">{document.errorMessage}</p>}
                </div>
                <div className="admin-document-actions">
                  <button disabled={isReindexing} onClick={() => reindex.mutate(document.id)}>
                    {isReindexing ? 'Đang xếp hàng…' : 'Lập chỉ mục lại'}
                  </button>
                  {document.failedJobId && (
                    <button
                      disabled={isRetrying}
                      onClick={() => retry.mutate(document.failedJobId!)}
                    >
                      {isRetrying ? 'Đang thử lại…' : 'Thử lại tác vụ lỗi'}
                    </button>
                  )}
                  {reindex.isSuccess && reindex.variables === document.id && (
                    <p>Đã xếp hàng lập chỉ mục.</p>
                  )}
                  {reindex.isError && reindex.variables === document.id && (
                    <p role="alert">Không thể xếp hàng lập chỉ mục lại.</p>
                  )}
                  {retry.isError && retry.variables === document.failedJobId && (
                    <p role="alert">Không thể thử lại tác vụ lỗi.</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
