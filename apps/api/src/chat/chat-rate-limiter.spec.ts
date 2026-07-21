import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { ChatRateLimiter } from './chat-rate-limiter.js';

describe('ChatRateLimiter', () => {
  it('limits the eleventh request in one minute and resets next window', () => {
    let now = new Date('2026-07-21T00:00:00.000Z');
    const config = { getOrThrow: () => 10 } as unknown as ConfigService;
    const limiter = new ChatRateLimiter(config, () => now);
    for (let index = 0; index < 10; index += 1) limiter.consume('owner');
    expect(() => limiter.consume('owner')).toThrowError(
      expect.objectContaining({ code: 'CHAT_RATE_LIMITED', statusCode: 429 })
    );
    now = new Date(now.getTime() + 60_001);
    expect(() => limiter.consume('owner')).not.toThrow();
  });
});
