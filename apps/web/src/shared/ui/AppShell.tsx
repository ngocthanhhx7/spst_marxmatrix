import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router';
import { AppFooter } from './AppFooter.js';
import { SiteHeader } from './SiteHeader.js';
import { SkipLink } from './SkipLink.js';

const authRoutes = new Set(['/login', '/register']);
const pageOwnedMainRoutes = new Set(['/', '/about', '/login', '/register']);
const pageOwnedFooterRoutes = new Set(['/', '/about', '/login', '/register']);

export function AppShell() {
  const location = useLocation();
  const pathname = location.pathname === '/' ? '/' : location.pathname.replace(/\/+$/, '');
  const isAuthRoute = authRoutes.has(pathname);
  const pageOwnsMain = pageOwnedMainRoutes.has(pathname);
  const pageOwnsFooter = pageOwnedFooterRoutes.has(pathname);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <>
      <SkipLink />
      {!isAuthRoute && <SiteHeader />}
      {pageOwnsMain ? (
        <Outlet />
      ) : (
        <main
          id="main-content"
          className={pageOwnsFooter ? 'main-content main-content--standalone' : 'main-content'}
          tabIndex={-1}
        >
          <Outlet />
        </main>
      )}
      {!pageOwnsFooter && <AppFooter />}
    </>
  );
}
