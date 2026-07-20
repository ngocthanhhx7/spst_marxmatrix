import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client.js';

describe('API client', () => {
  it('uses one refresh request for concurrent 401 responses and retries each request once', async () => {
    const requestCounts = new Map<string, number>();
    let refreshCalls = 0;
    const fetcher = ((input: RequestInfo | URL) => {
      if (typeof input !== 'string') throw new Error('Test fetcher expects string URLs.');
      const url = input;
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: 'new-token', user: {} }), { status: 200 })
        );
      }
      const prior = requestCounts.get(url) ?? 0;
      requestCounts.set(url, prior + 1);
      return Promise.resolve(
        prior === 0
          ? new Response('{}', { status: 401 })
          : new Response(JSON.stringify({ ok: true }), { status: 200 })
      );
    }) as typeof fetch;
    const client = createApiClient({ baseUrl: 'http://api.test', fetcher });
    await Promise.all([client.request('/first'), client.request('/second')]);
    expect(refreshCalls).toBe(1);
  });
  it('clears in-memory session when refresh fails and does not retry indefinitely', async () => {
    const clear = vi.fn();
    let refreshCalls = 0;
    const fetcher = ((input: RequestInfo | URL) => {
      if (typeof input !== 'string') throw new Error('Test fetcher expects string URLs.');
      if (input.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return Promise.resolve(new Response('{}', { status: 401 }));
      }
      return Promise.resolve(new Response('{}', { status: 401 }));
    }) as typeof fetch;
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetcher,
      getAccessToken: () => 'old',
      onUnauthenticated: clear
    });
    await expect(client.request('/protected')).rejects.toMatchObject({ statusCode: 401 });
    expect(refreshCalls).toBe(1);
    expect(clear).toHaveBeenCalledOnce();
  });
});
