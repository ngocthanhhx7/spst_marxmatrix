import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { restoreSession } from '../shared/api/runtime.js';
import { useSessionStore } from '../features/auth/session.js';
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient());
  useEffect(() => {
    if (useSessionStore.getState().status === 'unknown') void restoreSession();
  }, []);
  useEffect(() => {
    let activeUserId = useSessionStore.getState().user?.id;
    return useSessionStore.subscribe((state) => {
      const nextUserId = state.user?.id;
      if (nextUserId !== activeUserId) client.clear();
      activeUserId = nextUserId;
    });
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
