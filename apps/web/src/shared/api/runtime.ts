import { createApiClient } from './client.js';
import { useSessionStore } from '../../features/auth/session.js';
import { authResponseSchema } from '@marxmatrix/contracts';
const environment = import.meta.env as unknown;
const configuredBaseUrl =
  typeof environment === 'object' &&
  environment !== null &&
  typeof (environment as Record<string, unknown>)['VITE_API_BASE_URL'] === 'string'
    ? (environment as Record<string, string>)['VITE_API_BASE_URL']
    : undefined;
const baseUrl = configuredBaseUrl ?? 'http://localhost:3000/api/v1';
export const apiClient = createApiClient({
  baseUrl,
  getAccessToken: () => useSessionStore.getState().accessToken,
  onSession: (session) => {
    const parsed = authResponseSchema.safeParse(session);
    if (parsed.success) useSessionStore.getState().setSession(parsed.data);
    else useSessionStore.getState().clearSession();
  },
  onUnauthenticated: () => useSessionStore.getState().clearSession()
});
let restoration: Promise<void> | undefined;
export function restoreSession(): Promise<void> {
  if (restoration !== undefined) return restoration;
  restoration = apiClient
    .request('/auth/refresh', { method: 'POST' })
    .then((session) => {
      const parsed = authResponseSchema.safeParse(session);
      if (!parsed.success) throw new Error('Invalid refresh response.');
      useSessionStore.getState().setSession(parsed.data);
    })
    .catch(() => {
      useSessionStore.getState().clearSession();
    })
    .finally(() => {
      restoration = undefined;
    });
  return restoration;
}
