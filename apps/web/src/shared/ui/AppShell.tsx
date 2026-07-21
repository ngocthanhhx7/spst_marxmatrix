import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { logout } from '../../features/auth/api.js';
import { useSessionStore } from '../../features/auth/session.js';
import { AppFooter } from './AppFooter.js';
import { BrandMark } from './BrandMark.js';
import { SkipLink } from './SkipLink.js';
const primaryNavigation = [
  { to: '/dashboard', label: 'Bảng điều khiển' },
  { to: '/scanner', label: 'Scanner' },
  { to: '/copilot', label: 'Copilot' },
  { to: '/arena', label: 'Capital Arena' },
  { to: '/chat', label: 'AI Chat' }
] as const;
export function AppShell() {
  const clear = useSessionStore((state) => state.clearSession);
  const user = useSessionStore((state) => state.user);
  const location = useLocation();
  const isStandalonePublic = ['/', '/about', '/login', '/register'].includes(location.pathname);
  const pageOwnsMain = location.pathname === '/about';
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);
  const signOut = () => {
    void logout()
      .catch(() => undefined)
      .finally(clear);
  };
  return (
    <>
      <SkipLink />
      {!isStandalonePublic && (
        <>
          <header className="site-header">
            <BrandMark />
            {user ? (
              <nav aria-label="Primary workspace" className="app-navigation">
                {primaryNavigation.map((item) => (
                  <NavLink key={item.to} to={item.to}>
                    {item.label}
                  </NavLink>
                ))}
                {user.role === 'admin' && <NavLink to="/admin/documents">Học liệu</NavLink>}
              </nav>
            ) : (
              <nav aria-label="Tài khoản" className="account-navigation">
                <Link to="/login">Đăng nhập</Link>
                <Link className="button-link" to="/register">
                  Đăng ký
                </Link>
              </nav>
            )}
            {user && (
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
            )}
          </header>
          {user && (
            <nav aria-label="Mobile primary workspace" className="app-mobile-navigation">
              {primaryNavigation.map((item) => (
                <NavLink key={item.to} to={item.to} aria-label={`Mobile ${item.label}`}>
                  <span aria-hidden="true">{item.label}</span>
                </NavLink>
              ))}
            </nav>
          )}
        </>
      )}
      {pageOwnsMain ? (
        <Outlet />
      ) : (
        <main
          id="main-content"
          className={isStandalonePublic ? 'main-content main-content--standalone' : 'main-content'}
          tabIndex={-1}
        >
          <Outlet />
        </main>
      )}
      {!isStandalonePublic && <AppFooter />}
    </>
  );
}
