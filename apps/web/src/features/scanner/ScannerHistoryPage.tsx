import { useQuery } from '@tanstack/react-query';
import type { AnalysisListItem } from '@marxmatrix/contracts';
import { Link } from 'react-router';
import { apiClient } from '../../shared/api/runtime.js';
import { PageState } from '../../shared/ui/PageState.js';
import { useSessionStore } from '../auth/session.js';
import './ScannerWorkspace.css';

export function ScannerHistoryPage() {
  const userId = useSessionStore((state) => state.user?.id);
  const analyses = useQuery({
    queryKey: ['analyses', userId],
    queryFn: () => apiClient.request<AnalysisListItem[]>('/analyses')
  });
  return (
    <section className="scanner-workspace scanner-history" aria-labelledby="scanner-history-title">
      <header className="scanner-workspace__header">
        <p className="scanner-workspace__index">05 / SỔ PHÂN TÍCH</p>
        <h1 id="scanner-history-title">Hồ sơ phân tích</h1>
        <p>
          Tìm lại một trường hợp, mở phiếu phân tích và kiểm tra các phiên bản tính toán đã lưu.
        </p>
      </header>
      <nav className="scanner-workspace__actions" aria-label="Create or import an analysis source">
        <Link className="button-link" to="/scanner/new">
          PHÂN TÍCH THỦ CÔNG
        </Link>
        <Link className="text-link" to="/scanner/extract">
          Xem trích xuất AI từ PDF →
        </Link>
      </nav>
      {analyses.isLoading && (
        <PageState>
          <p>Đang tải các phân tích đã lưu…</p>
        </PageState>
      )}
      {analyses.isError && (
        <PageState>
          <p>Không thể tải danh sách phân tích.</p>
          <button onClick={() => void analyses.refetch()}>Thử lại</button>
        </PageState>
      )}
      {analyses.data?.length === 0 && (
        <PageState>
          <p>Chưa có phân tích nào.</p>
        </PageState>
      )}
      {analyses.data && analyses.data.length > 0 && (
        <ol className="scanner-ledger" aria-label="Danh sách phân tích đã lưu">
          {analyses.data.map((analysis) => (
            <li key={analysis.id}>
              <Link to={`/scanner/${analysis.id}`}>{analysis.title}</Link>
              <small>
                <span className="scanner-workspace__ledger-label">CẬP NHẬT</span>{' '}
                {new Date(analysis.updatedAt).toLocaleString('vi-VN')}
              </small>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
