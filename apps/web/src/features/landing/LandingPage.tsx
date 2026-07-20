import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router';
import { BrandMark } from '../../shared/ui/BrandMark.js';
import { useSessionStore } from '../auth/session.js';
import './LandingPage.css';

const analysisRows = [
  {
    entity: 'Cơ sở hạ tầng GPU',
    context: 'Tập trung nguồn lực phần cứng thế hệ mới.',
    values: [58, 76, 34],
    claim: 'Sự hội tụ của tư liệu lao động và hạ tầng AI vượt xa các cam kết trước đó.',
    source: 'SEC Filing · 6-K12 (Citation: 12)',
    status: 'Đã xác minh',
    tone: 'verified'
  },
  {
    entity: 'Mạng lưới phân phối',
    context: 'Chuỗi cung ứng nội dung tự động hóa.',
    values: [31, 68, 45],
    claim: 'Dữ liệu doanh thu quảng cáo không khớp với lượng traffic ghi nhận được.',
    source: 'Independent Audit A25',
    status: 'Cần đối chiếu',
    tone: 'conflict'
  }
] as const;

const processSteps = [
  ['01', 'Nguồn', 'Tập hợp dữ liệu từ báo cáo tài chính, nghiên cứu và văn bản.'],
  ['02', 'Trích xuất', 'Phân tích thực thể bằng AI-parser chuyên dụng cho ngôn ngữ học thuật.'],
  ['03', 'Đối chiếu', 'Kiểm tra trên mặt quan và phát hiện mâu thuẫn giữa các nguồn.'],
  ['04', 'Luận giải', 'Xây dựng hệ thống lập luận vững chắc với đầy đủ bằng chứng.']
] as const;

export function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const user = useSessionStore((state) => state.user);

  const handleAnchorNavigation = (event: MouseEvent<HTMLAnchorElement>) => {
    const targetId = event.currentTarget.hash.slice(1);
    const target = document.getElementById(targetId);
    if (!target) return;

    event.preventDefault();
    window.history.replaceState(null, '', `#${targetId}`);
    target.focus({ preventScroll: true });
    target.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    setMenuOpen(false);
  };

  return (
    <main className="landing" data-screen="landing-01">
      <p className="landing__utility-line">MARXMATRIX / EDITORIAL SYSTEMS / 2026</p>
      <header className="landing__header" role="banner">
        <BrandMark />
        <button
          className="landing__menu-button"
          type="button"
          aria-expanded={menuOpen}
          aria-controls="landing-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span>Menu</span>
          <span aria-hidden="true">{menuOpen ? '×' : '＋'}</span>
        </button>
        <nav
          id="landing-navigation"
          className="landing__nav"
          data-open={menuOpen}
          aria-label="Điều hướng công khai"
        >
          <a href="#method" onClick={handleAnchorNavigation}>
            Phương pháp
          </a>
          <a href="#tools" onClick={handleAnchorNavigation}>
            Công cụ
          </a>
          <Link to="/arena">Capital Arena</Link>
          <a href="#resources" onClick={handleAnchorNavigation}>
            Tài liệu
          </a>
        </nav>
        <div className="landing__account-links">
          {user ? (
            <>
              <Link to="/settings">{user.displayName}</Link>
              <Link className="landing__button landing__button--amber" to="/dashboard">
                <span className="landing__desktop-label">Vào workspace</span>
                <span className="landing__mobile-label">Workspace</span>
              </Link>
            </>
          ) : (
            <>
              <Link to="/login">Login</Link>
              <Link className="landing__button landing__button--amber" to="/scanner/new">
                <span className="landing__desktop-label">Bắt đầu phân tích</span>
                <span className="landing__mobile-label">Bắt đầu</span>
              </Link>
            </>
          )}
        </div>
      </header>

      <section className="landing__hero" aria-labelledby="landing-title">
        <div className="landing__hero-copy">
          <p className="landing__eyebrow">01 / LUẬN ĐỀ</p>
          <h1 id="landing-title">
            Nội soi <em>tư bản</em> công nghệ.
          </h1>
          <p className="landing__thesis">
            MarxMatrix chuyển hóa hàng triệu trang tài liệu và dữ liệu thô thành các luận điểm có
            thể kiểm chứng. Nền tảng phân tích cấu trúc dành cho điều tra chuyên sâu và tăng tốc học
            thuật.
          </p>
          <div className="landing__actions">
            <Link className="landing__button landing__button--amber" to="/scanner/new">
              <span aria-hidden="true">▧</span> Quét tài liệu
            </Link>
            <a
              className="landing__button landing__button--outline"
              href="#method"
              onClick={handleAnchorNavigation}
            >
              Khám phá phương pháp
            </a>
          </div>
        </div>

        <aside className="landing__status-card" aria-label="Trạng thái hệ thống phân tích">
          <div className="landing__status-head">
            <span>[System_status]</span>
            <strong>
              <span className="landing__desktop-label">Active_scanning</span>
              <span className="landing__mobile-label">74.2% completed</span>
            </strong>
          </div>
          <div className="landing__status-progress">
            <span />
          </div>
          <p>Processing: SEC_FILINGS_2024_Q3.PDF · found 12,402 nodes</p>
          <dl>
            <div>
              <dt>M/C ratio</dt>
              <dd>1.84</dd>
            </div>
            <div>
              <dt>VA index</dt>
              <dd>72.4k</dd>
            </div>
          </dl>
        </aside>
      </section>

      <section className="landing__analysis" aria-labelledby="analysis-title">
        <div className="landing__analysis-heading">
          <div>
            <p className="landing__eyebrow">Hồ sơ phân tích</p>
            <h2 id="analysis-title">Cloud Platform / 2025</h2>
          </div>
          <p>
            <span>REF: MX-992-DELTA</span>
            <span>CONFIDENCE: 98.4%</span>
          </p>
        </div>

        <div className="landing__table-wrap">
          <div className="landing__mobile-table-head">
            <span>Thực thể / cấu trúc</span>
            <span>Trạng thái</span>
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">Thực thể phân tích</th>
                <th scope="col">Cấu trúc c/v/m</th>
                <th scope="col">Luận điểm &amp; chứng cứ</th>
                <th scope="col">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {analysisRows.map((row) => (
                <tr key={row.entity}>
                  <td data-label="Thực thể phân tích">
                    <strong>{row.entity}</strong>
                    <span>{row.context}</span>
                  </td>
                  <td data-label="Cấu trúc c/v/m">
                    <span
                      className="landing__mini-bars"
                      aria-label={`Chỉ số cấu trúc ${row.values.join(', ')}`}
                    >
                      {row.values.map((value, index) => (
                        <i key={value} style={{ height: `${value}%` }} data-index={index} />
                      ))}
                    </span>
                  </td>
                  <td data-label="Luận điểm & chứng cứ">
                    <q>{row.claim}</q>
                    <cite>{row.source}</cite>
                  </td>
                  <td data-label="Trạng thái">
                    <span className={`landing__status landing__status--${row.tone}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="landing__tools" id="tools" tabIndex={-1} aria-label="Công cụ MarxMatrix">
        <article id="scanner" tabIndex={-1}>
          <div
            className="landing__tool-specimen landing__tool-specimen--ledger"
            aria-label="Scanner evidence specimen"
          >
            <span>OCR / ENTITY MAP</span>
            <strong>12,402 nodes</strong>
            <i />
          </div>
          <span className="landing__tool-icon landing__tool-icon--cyan" aria-hidden="true">
            {'{}'}
          </span>
          <h2>
            <span className="landing__desktop-label">Công cụ Trích xuất Thông minh</span>
            <span className="landing__mobile-label">Scanner</span>
          </h2>
          <p>
            Tự động nhận diện thực thể và cấu trúc logic từ các tài liệu PDF dày đặc. Giữ nguyên khả
            năng truy xuất ngược để tăng độ tin cậy.
          </p>
          <ul>
            <li>UIH dữ liệu chính xác 99.9%</li>
            <li>Bản đồ hóa thực thể tự động</li>
          </ul>
          <Link to="/scanner/new">
            Mở Scanner <span aria-hidden="true">↗</span>
          </Link>
        </article>
        <article id="copilot" tabIndex={-1}>
          <div
            className="landing__tool-specimen landing__tool-specimen--answer"
            aria-label="Copilot citation specimen"
          >
            <span>CLAIM / SOURCE</span>
            <strong>3 citations attached</strong>
            <i />
          </div>
          <span className="landing__tool-icon landing__tool-icon--amber" aria-hidden="true">
            ⌾
          </span>
          <h2>
            <span className="landing__desktop-label">Copilot RAG Chuyên sâu</span>
            <span className="landing__mobile-label">Copilot RAG</span>
          </h2>
          <p>
            Hệ thống trả lời câu hỏi dựa trên cơ sở dữ liệu nội bộ — tuyệt đối không ảo giác, luôn
            đi kèm trích dẫn nguồn thực.
          </p>
          <ul>
            <li>Grounded truth engine</li>
            <li>Đối soát chéo đa tài liệu</li>
          </ul>
          <Link to="/copilot">
            Mở Copilot <span aria-hidden="true">↗</span>
          </Link>
        </article>
        <article id="arena" tabIndex={-1}>
          <div
            className="landing__tool-specimen landing__tool-specimen--timeline"
            aria-label="Arena round specimen"
          >
            <span>ROUND 04 / MARKET STATE</span>
            <strong>Decision window 00:42</strong>
            <i />
          </div>
          <span className="landing__tool-icon landing__tool-icon--red" aria-hidden="true">
            ※
          </span>
          <h2>Capital Arena</h2>
          <p>
            Không gian tranh luận cấu trúc. Thử nghiệm các luận điểm trong môi trường giả lập để tìm
            ra điểm yếu logic trước khi xuất bản.
          </p>
          <ul>
            <li>Luận chiến phản biện AI</li>
            <li>Chỉ số sẵn sàng luận điểm</li>
          </ul>
          <Link to="/arena">
            Vào Capital Arena <span aria-hidden="true">↗</span>
          </Link>
        </article>
      </section>

      <section className="landing__method" id="method" tabIndex={-1} aria-labelledby="method-title">
        <h2 id="method-title">Quy trình tổng hợp bằng chứng</h2>
        <ol>
          {processSteps.map(([number, title, description]) => (
            <li key={number}>
              <span>{number}</span>
              <strong>{title}</strong>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="landing__security"
        id="privacy"
        tabIndex={-1}
        aria-labelledby="security-title"
      >
        <div>
          <p className="landing__eyebrow">Bảo mật / Quyền kiểm soát</p>
          <h2 id="security-title">Bảo mật &amp; Quyền kiểm soát tuyệt đối.</h2>
          <p>
            Tài liệu của bạn là tài sản của bạn. MarxMatrix hoạt động trên mô hình riêng biệt, không
            đào tạo trên dữ liệu người dùng, đảm bảo toàn bộ mật khẩu và cuộc điều tra nhạy cảm được
            bảo vệ.
          </p>
          <dl className="landing__security-metrics">
            <div>
              <dt>100%</dt>
              <dd>Traceability</dd>
            </div>
            <div>
              <dt>Zero</dt>
              <dd>Data Leakage</dd>
            </div>
          </dl>
        </div>
        <aside>
          <div>
            <span aria-hidden="true">⬟</span>
            <strong>Môi trường Phân tích Cách biệt</strong>
            <small>STATUS: VERIFIED ENV</small>
          </div>
          <p>
            Mọi truy vấn được xử lý trong sandbox mã hóa cấp độ quân sự. Xóa toàn toàn cầu viết sau
            mỗi phiên làm việc nếu được yêu cầu.
          </p>
          <a href="#privacy" onClick={handleAnchorNavigation}>
            Xem báo cáo bảo mật
          </a>
        </aside>
      </section>

      <section className="landing__final" aria-labelledby="final-title">
        <h2 id="final-title">Sẵn sàng bắt đầu cuộc điều tra tiếp theo?</h2>
        <Link className="landing__button landing__button--amber" to="/register">
          Đăng ký bản dùng thử beta
        </Link>
        <p>Hệ thống dành cho tổ chức và chuyên gia độc lập.</p>
      </section>

      <footer className="landing__footer">
        <div className="landing__footer-brand">
          <BrandMark />
          <p>Hệ thống biên tập cấu trúc cho nghiên cứu và báo cáo điều tra thế hệ mới.</p>
        </div>
        <nav aria-label="Product">
          <strong>Product</strong>
          <a href="#scanner" onClick={handleAnchorNavigation}>
            Scanner
          </a>
          <a href="#copilot" onClick={handleAnchorNavigation}>
            Copilot
          </a>
          <Link to="/arena">Arena</Link>
        </nav>
        <nav id="resources" tabIndex={-1} aria-label="Resources">
          <strong>Resources</strong>
          <a href="#method" onClick={handleAnchorNavigation}>
            Documentation
          </a>
          <a href="#method" onClick={handleAnchorNavigation}>
            Methodology
          </a>
          <a href="#analysis-title" onClick={handleAnchorNavigation}>
            Whitepapers
          </a>
          <span className="landing__mobile-only-link">API Docs</span>
        </nav>
        <nav aria-label="Legal">
          <strong>Legal</strong>
          <a href="#privacy" onClick={handleAnchorNavigation}>
            Privacy Policy
          </a>
          <a href="#privacy" onClick={handleAnchorNavigation}>
            Terms of Use
          </a>
          <a href="#privacy" onClick={handleAnchorNavigation}>
            Cookie Policy
          </a>
        </nav>
        <nav aria-label="Method">
          <strong>Method</strong>
          <a href="#method" onClick={handleAnchorNavigation}>
            Evidence protocol
          </a>
          <a href="#analysis-title" onClick={handleAnchorNavigation}>
            Source ledger
          </a>
          <a href="#privacy" onClick={handleAnchorNavigation}>
            Limits
          </a>
        </nav>
        <nav aria-label="System">
          <strong>System</strong>
          <span>Version 2.04</span>
          <span>Source provenance: visible</span>
          <span>Accessibility: WCAG-minded</span>
        </nav>
        <nav className="landing__footer-connect" aria-label="Connect">
          <strong>Connect</strong>
          <span>Twitter / X</span>
          <span>Contact</span>
        </nav>
        <div className="landing__footer-meta">
          <span>© 2026 MarxMatrix. Editorial systems.</span>
          <span>
            <i /> System_stable_v2.04
          </span>
        </div>
      </footer>
    </main>
  );
}
