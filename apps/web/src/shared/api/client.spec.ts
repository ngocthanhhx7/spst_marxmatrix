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

  it('returns a readable response after the same single-flight 401 refresh', async () => {
    let refreshCalls = 0;
    const requestHeaders: Headers[] = [];
    const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input !== 'string') throw new Error('Test fetcher expects string URLs.');
      if (input.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: 'new-token', user: {} }), { status: 200 })
        );
      }
      requestHeaders.push(new Headers(init?.headers));
      return Promise.resolve(
        requestHeaders.length === 1
          ? new Response('{}', { status: 401 })
          : new Response('{"type":"checking_scope"}\n', { status: 200 })
      );
    }) as typeof fetch;
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetcher,
      getAccessToken: () => (refreshCalls === 0 ? 'old-token' : 'new-token')
    });

    const response = await client.response('/chat/conversations/id/messages', {
      method: 'POST',
      body: new FormData()
    });

    expect(await response.text()).toBe('{"type":"checking_scope"}\n');
    expect(refreshCalls).toBe(1);
    expect(requestHeaders.at(-1)?.get('authorization')).toBe('Bearer new-token');
  });

  it('passes the caller AbortSignal to the streaming request', async () => {
    const fetcher = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      })) as typeof fetch;
    const client = createApiClient({ baseUrl: 'http://api.test', fetcher });
    const controller = new AbortController();
    const request = client.response('/chat/test', { signal: controller.signal });

    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});
