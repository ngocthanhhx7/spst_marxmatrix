import { Link, NavLink } from 'react-router';
import { logout } from '../../features/auth/api.js';
import { useSessionStore } from '../../features/auth/session.js';
import { BrandMark } from './BrandMark.js';
import { primaryNavigation } from './site-navigation.js';

export function SiteHeader() {
  const clear = useSessionStore((state) => state.clearSession);
  const user = useSessionStore((state) => state.user);
  const signOut = () => {
    void logout()
      .catch(() => undefined)
      .finally(clear);
  };

  return (
    <>
      <header className="site-header">
        <BrandMark />
        <nav aria-label="Điều hướng sản phẩm" className="app-navigation">
          {primaryNavigation.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
          {user?.role === 'admin' && <NavLink to="/admin/documents">Học liệu</NavLink>}
        </nav>
        {user ? (
          <div className="app-header-actions">
            <Link className="app-header-actions__evidence" to="/#method">
              Tư liệu
            </Link>
            <span className="app-header-actions__status" aria-label="Hệ thống sẵn sàng" />
            <Link className="app-header-actions__account" to="/settings">
              {user.displayName}
            </Link>
            <button type="button" onClick={signOut}>
              Đăng xuất
            </button>
          </div>
        ) : (
          <nav aria-label="Tài khoản" className="account-navigation">
            <Link to="/login">Đăng nhập</Link>
            <Link className="button-link" to="/register">
              Đăng ký
            </Link>
          </nav>
        )}
      </header>
      <nav aria-label="Điều hướng di động" className="app-mobile-navigation">
        {primaryNavigation.map((item) => (
          <NavLink key={item.to} to={item.to}>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}
