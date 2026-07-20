import { Navigate, Outlet } from 'react-router';
import { PageState } from '../../shared/ui/PageState.js';
import { useSessionStore } from './session.js';

export function GuestOnlyRoute() {
  const { accessToken, status } = useSessionStore((state) => state);

  if (status === 'unknown') return <PageState>Đang kiểm tra phiên đăng nhập…</PageState>;
  if (status === 'authenticated' && accessToken !== undefined)
    return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
