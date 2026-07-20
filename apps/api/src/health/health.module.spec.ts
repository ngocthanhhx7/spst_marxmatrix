import { RequestMethod, type MiddlewareConsumer } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HealthModule } from './health.module.js';

describe('HealthModule', () => {
  it('registers request IDs with an Express 5-compatible catch-all route', () => {
    const forRoutes = vi.fn();
    const consumer = {
      apply: vi.fn().mockReturnValue({ forRoutes })
    } as unknown as MiddlewareConsumer;

    new HealthModule().configure(consumer);

    expect(forRoutes).toHaveBeenCalledWith({ path: '{*path}', method: RequestMethod.ALL });
  });
});
