import { Navigate, Outlet, useLocation } from 'react-router';
import { useSessionStore } from './session.js';
import { PageState } from '../../shared/ui/PageState.js';
export function ProtectedRoute() {
  const { accessToken: token, status } = useSessionStore((state) => state);
  const location = useLocation();
  if (status === 'unknown') return <PageState>Đang kiểm tra phiên đăng nhập…</PageState>;
  if (status === 'unauthenticated' || token === undefined)
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
