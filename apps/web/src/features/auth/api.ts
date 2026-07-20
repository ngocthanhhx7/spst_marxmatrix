import {
  type LoginInput,
  type RegisterInput,
  type authResponseSchema
} from '@marxmatrix/contracts';
import type { z } from 'zod';
import { apiClient } from '../../shared/api/runtime.js';
type AuthResponse = z.infer<typeof authResponseSchema>;
export const login = (body: LoginInput) =>
  apiClient.request<AuthResponse>('/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
export const register = (body: RegisterInput) =>
  apiClient.request<AuthResponse>('/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
export const logout = () => apiClient.request('/auth/logout', { method: 'POST' });
