import { Link } from 'react-router';
import { useSessionStore } from '../auth/session.js';
import './DashboardPage.css';

const nextActions = [
  {
    index: '01',
    label: 'Scanner',
    to: '/scanner',
    detail: 'Trở lại dữ kiện, phép tính và giả định đã lưu.'
  },
  {
    index: '02',
    label: 'Copilot RAG',
    to: '/copilot',
    detail: 'Mở một câu hỏi và lần theo trích dẫn của nó.'
  },
  {
    index: '03',
    label: 'Capital Arena',
    to: '/arena',
    detail: 'Luyện quyết định trong thị trường mô phỏng chung.'
  }
] as const;

export function DashboardPage() {
  const user = useSessionStore((state) => state.user);
  const learnerName = user?.displayName?.trim() || 'bạn';

  return (
    <section
      className="dashboard-page"
      data-screen="dashboard-04"
      aria-labelledby="dashboard-title"
    >
      <header className="dashboard-page__header">
        <div>
          <p className="dashboard-page__eyebrow">EVIDENCE ACTIVE / Step 1 of 3</p>
          <h1 id="dashboard-title">Bàn làm việc điều tra</h1>
          <p>
            Chào {learnerName}. Bắt đầu với một dữ kiện có nguồn, rồi kiểm tra giả định và hệ quả
            của nó.
          </p>
        </div>
        <Link className="dashboard-page__primary-action" to="/scanner/new">
          QUÉT TÀI LIỆU MỚI
        </Link>
      </header>
      <div className="dashboard-page__layout">
        <div className="dashboard-page__main">
          <section className="dashboard-page__modules" aria-label="Research modules">
            {nextActions.map((action) => (
              <article key={action.to}>
                <span aria-hidden="true">{action.index}</span>
                <h2>{action.label}</h2>
                <p>{action.detail}</p>
                <Link to={action.to}>
                  {action.label} <b aria-hidden="true">→</b>
                </Link>
              </article>
            ))}
          </section>
          <section className="dashboard-page__recent" aria-labelledby="recent-work-title">
            <div className="dashboard-page__section-heading">
              <p>ACTIVITY / LEDGER</p>
              <h2 id="recent-work-title">Hoạt động gần đây</h2>
            </div>
            <div className="dashboard-page__empty-ledger">
              <strong>CHƯA CÓ HOẠT ĐỘNG ĐƯỢC GHI NHẬN</strong>
              <p>
                Không bịa tiến độ cá nhân khi chưa có dữ liệu hoạt động. Bắt đầu bằng Scanner để tạo
                bằng chứng đầu tiên.
              </p>
            </div>
          </section>
          <section className="dashboard-page__next" aria-labelledby="thesis-title">
            <p className="dashboard-page__eyebrow">FIRST USE / EVIDENCE PATH</p>
            <h2 id="thesis-title">Khởi tạo luận án đầu tiên</h2>
            <p>
              Đặt một case có thể kiểm tra, liên kết nguồn, rồi đưa giả định vào cuộc đối thoại có
              dẫn chứng.
            </p>
            <ul aria-label="Evidence legend">
              <li>
                <i />
                Nguồn và phạm vi
              </li>
              <li>
                <i />
                Giả định kiểm tra
              </li>
              <li>
                <i />
                Hệ quả cần phản biện
              </li>
            </ul>
            <Link className="dashboard-page__text-link" to="/scanner/new">
              BẮT ĐẦU VỚI SCANNER <span aria-hidden="true">→</span>
            </Link>
          </section>
        </div>
        <aside className="dashboard-page__rail" aria-label="Hàng chờ xử lý">
          <p className="dashboard-page__eyebrow">QUEUE / SYSTEM STATUS</p>
          <h2>HÀNG CHỜ XỬ LÝ</h2>
          <p className="dashboard-page__sample">SAMPLE / không phải hoạt động cá nhân</p>
          <ol>
            <li>
              <span>Đọc cấu trúc PDF</span>
              <progress value="68" max="100">
                68%
              </progress>
              <small>SYSTEMIC</small>
            </li>
            <li>
              <span>Lập chỉ mục dẫn chứng</span>
              <progress value="32" max="100">
                32%
              </progress>
              <small>SYSTEMIC</small>
            </li>
          </ol>
          <section className="dashboard-page__quota" aria-labelledby="quota-title">
            <p>STORAGE / LOCAL VIEW</p>
            <h3 id="quota-title">Dung lượng học liệu</h3>
            <strong>Chưa có dữ liệu quota</strong>
            <span>Quota sẽ chỉ hiện khi máy chủ cung cấp số liệu.</span>
          </section>
        </aside>
      </div>
    </section>
  );
}
