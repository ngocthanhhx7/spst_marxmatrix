import { Link } from 'react-router';

export function AppFooter() {
  return (
    <footer className="app-footer">
      <div>
        <p className="eyebrow">SYSTEM / LEARNING WORKSPACE</p>
        <p>Evidence-backed · Human review · Deterministic calculation</p>
      </div>
      <nav aria-label="Phương pháp và chính sách">
        <Link to="/#method">Phương pháp</Link>
        <Link to="/#privacy">Quyền riêng tư</Link>
      </nav>
      <p className="app-footer__status" role="status">
        <span aria-hidden="true" /> Hệ thống sẵn sàng
      </p>
    </footer>
  );
}
