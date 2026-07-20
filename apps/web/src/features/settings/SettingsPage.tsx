import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { logout } from '../auth/api.js';
import { useSessionStore } from '../auth/session.js';
import './SettingsPage.css';

type Preferences = { reduceMotion: boolean };
const preferenceKey = 'marxmatrix.preferences';

function loadPreferences(): Preferences {
  try {
    const value = window.localStorage.getItem(preferenceKey);
    if (value === null) return { reduceMotion: false };
    const parsed = JSON.parse(value) as Partial<Preferences>;
    return { reduceMotion: parsed.reduceMotion === true };
  } catch {
    return { reduceMotion: false };
  }
}

export function SettingsPage() {
  const user = useSessionStore((state) => state.user);
  const clearSession = useSessionStore((state) => state.clearSession);
  const navigate = useNavigate();
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(preferenceKey, JSON.stringify(preferences));
    document.documentElement.dataset['reduceMotion'] = String(preferences.reduceMotion);
  }, [preferences]);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch {
      // Local session cleanup must still work when the server session has already expired.
    } finally {
      clearSession();
      void navigate('/login', { replace: true });
    }
  }

  return (
    <section className="settings-page" data-screen="settings-17" aria-labelledby="settings-title">
      <nav className="settings-page__breadcrumb" aria-label="Vị trí hiện tại">
        <span>Không gian học tập</span>
        <span aria-hidden="true">/</span>
        <strong>Thiết lập</strong>
      </nav>
      <header className="settings-page__header">
        <p className="settings-page__saved">SESSION ACTIVE / LOCAL CONTROLS</p>
        <p>ACCOUNT / PERSONAL CONTROLS</p>
        <h1 id="settings-title">Thiết lập cá nhân.</h1>
        <p>
          Các trường nhận diện lấy từ phiên hiện tại và chỉ đọc cho đến khi MarxMatrix có điểm cập
          nhật hồ sơ chính thức.
        </p>
      </header>

      <div className="settings-page__layout">
        <div className="settings-page__sections">
          <section aria-labelledby="identity-title">
            <div className="settings-page__section-heading">
              <p>01 / DANH TÍNH</p>
              <h2 id="identity-title">Tài khoản hiện tại</h2>
            </div>
            <div className="settings-page__identity-grid">
              <label>
                Tên hiển thị
                <input value={user?.displayName ?? ''} readOnly aria-readonly="true" />
              </label>
              <label>
                Email
                <input value={user?.email ?? ''} readOnly aria-readonly="true" />
              </label>
              <dl>
                <div>
                  <dt>VAI TRÒ</dt>
                  <dd>{user?.role === 'admin' ? 'Quản trị viên' : 'Người học'}</dd>
                </div>
                <div>
                  <dt>TRẠNG THÁI</dt>
                  <dd>Đang xác thực trong phiên này</dd>
                </div>
              </dl>
            </div>
          </section>

          <section aria-labelledby="appearance-title">
            <div className="settings-page__section-heading">
              <p>02 / HIỂN THỊ</p>
              <h2 id="appearance-title">Nhịp đọc của giao diện</h2>
            </div>
            <label className="settings-page__toggle">
              <input
                type="checkbox"
                checked={preferences.reduceMotion}
                onChange={(event) => setPreferences({ reduceMotion: event.target.checked })}
              />
              <span>
                <strong>Giảm chuyển động</strong>
                <small>Ưu tiên trạng thái tĩnh và chuyển cảnh tối giản trên thiết bị này.</small>
              </span>
            </label>
          </section>

          <section aria-labelledby="privacy-title">
            <div className="settings-page__section-heading">
              <p>03 / RIÊNG TƯ &amp; AI</p>
              <h2 id="privacy-title">Ranh giới dữ liệu</h2>
            </div>
            <div className="settings-page__notice">
              <p>
                MarxMatrix không hiển thị khóa API, token hay nội dung nhạy cảm ở đây. Tùy chọn hiển
                thị được lưu cục bộ; dữ liệu học liệu và câu hỏi vẫn tuân theo phiên đăng nhập hiện
                tại.
              </p>
              <p>
                Trạng thái nhà cung cấp AI được quản lý ở cấu hình máy chủ. Trang này không cho phép
                nhập hoặc thay đổi thông tin xác thực.
              </p>
            </div>
          </section>
        </div>

        <aside className="settings-page__rail" aria-label="Session security">
          <p>SESSION / SECURITY</p>
          <p className="settings-page__evidence">Identity evidence / session-bound</p>
          <h2>Kiểm soát phiên</h2>
          <section
            className="settings-page__current-session"
            aria-labelledby="current-session-title"
          >
            <h2 id="current-session-title">Current session</h2>
            <dl>
              <div>
                <dt>IDENTITY</dt>
                <dd>{user?.email ?? 'Chưa xác thực'}</dd>
              </div>
              <div>
                <dt>DEVICE</dt>
                <dd>Thiết bị hiện tại</dd>
              </div>
              <div>
                <dt>AUTH</dt>
                <dd>Phiên đang hoạt động</dd>
              </div>
            </dl>
          </section>
          <p>
            Đăng xuất sẽ xóa thông tin phiên khỏi thiết bị này, kể cả khi máy chủ tạm thời không
            phản hồi.
          </p>
          <button type="button" onClick={() => void handleLogout()} disabled={isLoggingOut}>
            {isLoggingOut ? 'Đang đăng xuất…' : 'Đăng xuất khỏi thiết bị'}
          </button>
        </aside>
      </div>
    </section>
  );
}
