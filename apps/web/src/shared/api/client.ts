import { ApiError } from './api-error.js';

type Fetcher = typeof fetch;
type Session = { accessToken: string; user: unknown };
export interface ApiClientOptions {
  baseUrl: string;
  fetcher?: Fetcher;
  getAccessToken?: () => string | undefined;
  onSession?: (session: Session) => void;
  onUnauthenticated?: () => void;
}
export interface ApiClient {
  request: <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
  response: (path: string, init?: RequestInit) => Promise<Response>;
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const fetcher = options.fetcher ?? fetch;
  let refreshing: Promise<string | undefined> | undefined;
  const refresh = async (): Promise<string | undefined> => {
    if (refreshing !== undefined) return refreshing;
    refreshing = fetcher(`${options.baseUrl}/auth/refresh`, {
      method: 'POST',
      credentials: 'include'
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('refresh failed');
        const session = (await response.json()) as Session;
        options.onSession?.(session);
        return session.accessToken;
      })
      .catch(() => {
        options.onUnauthenticated?.();
        return undefined;
      })
      .finally(() => {
        refreshing = undefined;
      });
    return refreshing;
  };
  const fetchAuthenticated = async (
    path: string,
    init: RequestInit = {},
    retried = false
  ): Promise<Response> => {
    const headers = new Headers(init.headers);
    const accessToken = options.getAccessToken?.();
    if (accessToken !== undefined) headers.set('authorization', `Bearer ${accessToken}`);
    const response = await fetcher(`${options.baseUrl}${path}`, {
      ...init,
      headers,
      credentials: 'include'
    });
    if (response.status === 401 && !retried && !path.endsWith('/auth/refresh')) {
      const nextToken = await refresh();
      if (nextToken !== undefined) return fetchAuthenticated(path, init, true);
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
        details?: unknown[];
      };
      throw new ApiError(
        response.status,
        body.code ?? 'HTTP_ERROR',
        body.message ?? 'Request failed.',
        body.details ?? []
      );
    }
    return response;
  };
  const response = (path: string, init?: RequestInit): Promise<Response> =>
    fetchAuthenticated(path, init);
  const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
    const rawResponse = await response(path, init);
    if (rawResponse.status === 204) return undefined as T;
    return (await rawResponse.json()) as T;
  };
  return { request, response };
}
