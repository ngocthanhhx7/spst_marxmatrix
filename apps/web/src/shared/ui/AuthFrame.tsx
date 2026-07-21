import type { ReactNode } from 'react';
import { Link } from 'react-router';
import './AuthFrame.css';
import { BrandMark } from './BrandMark.js';

interface AuthFrameProps {
  variant: 'login' | 'register';
  children: ReactNode;
}

const loginClaims = [
  'Nguồn đi trước kết luận.',
  'Lập luận phải kiểm tra được.',
  'Giữ dấu vết cho mỗi quyết định.'
];
const registerSteps = ['Tạo hồ sơ', 'Thêm nguồn', 'Phân tích', 'Đối chiếu'];

export function AuthFrame({ variant, children }: AuthFrameProps) {
  const isLogin = variant === 'login';
  return (
    <div className={`auth-frame auth-frame--${variant}`}>
      <header className="auth-frame__header">
        <BrandMark className="auth-frame__wordmark" />
        <nav aria-label="Điều hướng tài khoản">
          <Link to="/">Về trang chủ</Link>
          <Link className="auth-frame__resources" to="/#method">
            Tư liệu
          </Link>
        </nav>
      </header>
      <main id="main-content" className="auth-frame__content" tabIndex={-1}>
        <section className="auth-frame__introduction" aria-labelledby="auth-frame-title">
          {isLogin ? (
            <>
              <p className="auth-frame__index">02 / EVIDENCE PROTOCOL</p>
              <h1 id="auth-frame-title">BẢN TUYÊN NGÔN BẰNG CHỨNG</h1>
              <p>Mỗi nhận định trong MarxMatrix đều bắt đầu bằng một nguồn có thể đối chiếu.</p>
              <blockquote className="auth-frame__quote">
                “Không có bằng chứng, không có kết luận.”
              </blockquote>
              <aside className="auth-frame__evidence-card" aria-label="Evidence protocol">
                <div>
                  <span>CASE ID</span>
                  <strong>MM–02</strong>
                  <span>CONFIDENCE</span>
                  <strong>98%</strong>
                </div>
                <ol>
                  {loginClaims.map((claim, index) => (
                    <li key={claim}>
                      <span>0{index + 1}</span>
                      {claim}
                    </li>
                  ))}
                </ol>
              </aside>
            </>
          ) : (
            <>
              <p className="auth-frame__index">03 / RESEARCH PROTOCOL</p>
              <h1 id="auth-frame-title">Khởi tạo quy trình nghiên cứu.</h1>
              <p>
                Từ nguồn gốc đến đối chiếu: một không gian học tập đặt bằng chứng làm trung tâm.
              </p>
              <ol className="auth-frame__steps">
                {registerSteps.map((step, index) => (
                  <li key={step}>
                    <span>0{index + 1}</span>
                    {step}
                  </li>
                ))}
              </ol>
              <p className="auth-frame__doctrine">
                Không thay thế phán đoán. Cung cấp dấu vết để bạn tự kiểm chứng.
              </p>
            </>
          )}
        </section>
        <section className="auth-frame__form-panel" aria-label="Biểu mẫu tài khoản">
          {children}
        </section>
      </main>
      <footer className="auth-frame__footer">
        <span>WORKSPACE SESSION ENCRYPTED</span>
        <span>RIÊNG TƯ</span>
        <span>ĐIỀU KHOẢN</span>
        <span>MARXMATRIX / RESEARCH SYSTEM</span>
      </footer>
    </div>
  );
}
