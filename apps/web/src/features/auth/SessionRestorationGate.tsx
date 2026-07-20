import { Outlet } from 'react-router';
import { PageState } from '../../shared/ui/PageState.js';
import { useSessionStore } from './session.js';

export function SessionRestorationGate() {
  const status = useSessionStore((state) => state.status);
  if (status === 'unknown') return <PageState>Đang kiểm tra phiên đăng nhập…</PageState>;
  return <Outlet />;
}
