import { Navigate, Outlet } from 'react-router';
import { useSessionStore } from './session.js';
import { PageState } from '../../shared/ui/PageState.js';
export function AdminRoute() {
  const { status, user } = useSessionStore((state) => state);
  if (status === 'unknown') return <PageState>Đang kiểm tra phiên đăng nhập…</PageState>;
  return user?.role === 'admin' ? <Outlet /> : <Navigate to="/dashboard" replace />;
}
