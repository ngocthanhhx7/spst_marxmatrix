import { describe, expect, it, vi } from 'vitest';
import { arenaApi } from './arena.api.js';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('../../shared/api/runtime.js', () => ({
  apiClient: { request }
}));

describe('arenaApi', () => {
  it('includes the URL game id in the validated decision payload', async () => {
    request.mockResolvedValue({});

    await arenaApi.decision('507f1f77bcf86cd799439011', {
      round: 2,
      expectedStateVersion: 6,
      hiringChange: 0,
      wageAdjustment: 0,
      automationInvestment: 0,
      price: 20,
      qualityMarketingInvestment: 0,
      inventoryTarget: 8
    });

    expect(request).toHaveBeenCalledWith(
      '/games/507f1f77bcf86cd799439011/decisions',
      expect.objectContaining({ method: 'POST' })
    );
    const init = request.mock.calls[0]?.[1] as RequestInit;
    if (typeof init.body !== 'string') throw new Error('Decision request body must be JSON text.');
    const payload = JSON.parse(init.body) as { gameId?: string };
    expect(payload.gameId).toBe('507f1f77bcf86cd799439011');
  });
});
