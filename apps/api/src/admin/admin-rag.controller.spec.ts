/* eslint-disable @typescript-eslint/require-await */
import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { ROLES_KEY } from '../identity/roles.decorator.js';
import { AdminRagController } from './admin-rag.controller.js';

describe('AdminRagController', () => {
  it('declares the authoritative admin role and delegates retry only to the service boundary', async () => {
    const retried: string[] = [];
    const controller = new AdminRagController({
      retry: async (id: string) => (retried.push(id), { status: 'queued' })
    } as never);

    expect(Reflect.getMetadata(ROLES_KEY, AdminRagController)).toEqual(['admin']);
    await expect(controller.retry('507f1f77bcf86cd799439011')).resolves.toEqual({
      status: 'queued'
    });
    expect(retried).toEqual(['507f1f77bcf86cd799439011']);
  });
});
