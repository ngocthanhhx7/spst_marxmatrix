import { act, cleanup, render, waitFor } from '@testing-library/react';
import { type QueryClient, useQueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { useSessionStore } from '../features/auth/session.js';
import { Providers } from './providers.js';

vi.mock('../shared/api/runtime.js', () => ({
  restoreSession: vi.fn().mockResolvedValue(undefined)
}));

function CaptureClient({ capture }: { capture: (client: QueryClient) => void }) {
  const client = useQueryClient();
  useEffect(() => capture(client), [capture, client]);
  return null;
}

afterEach(() => {
  cleanup();
  useSessionStore.getState().clearSession();
});

describe('private query cache isolation', () => {
  it('clears account A data on account transition and account B data on logout', async () => {
    const accountA = {
      id: '507f1f77bcf86cd799439011',
      email: 'a@example.test',
      displayName: 'A',
      role: 'student' as const
    };
    const accountB = {
      ...accountA,
      id: '507f1f77bcf86cd799439012',
      email: 'b@example.test',
      displayName: 'B'
    };
    useSessionStore.getState().setSession({ accessToken: 'token-a', user: accountA });
    let client: QueryClient | undefined;
    render(
      <Providers>
        <CaptureClient
          capture={(value) => {
            client = value;
          }}
        />
      </Providers>
    );
    await waitFor(() => expect(client).toBeDefined());
    act(() => {
      client?.setQueryData(['analysis', accountA.id, 'private'], 'account-a-secret');
    });

    act(() => useSessionStore.getState().setSession({ accessToken: 'token-b', user: accountB }));
    await waitFor(() =>
      expect(client?.getQueryData(['analysis', accountA.id, 'private'])).toBeUndefined()
    );
    act(() => {
      client?.setQueryData(['analysis', accountB.id, 'private'], 'account-b-secret');
    });

    act(() => useSessionStore.getState().clearSession());
    await waitFor(() =>
      expect(client?.getQueryData(['analysis', accountB.id, 'private'])).toBeUndefined()
    );
  });
});
