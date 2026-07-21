import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DomainError } from '../common/domain-error.js';

type Window = { startedAt: number; count: number };

@Injectable()
export class ChatRateLimiter {
  private readonly windows = new Map<string, Window>();

  public constructor(
    private readonly config: ConfigService,
    @Optional()
    private readonly clock: () => Date = () => new Date()
  ) {}

  public consume(ownerId: string): void {
    const now = this.clock().getTime();
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= 60_000) this.windows.delete(key);
    }
    const limit = this.config.getOrThrow<number>('CHAT_RATE_LIMIT_PER_MINUTE');
    const existing = this.windows.get(ownerId);
    if (existing === undefined) {
      this.windows.set(ownerId, { startedAt: now, count: 1 });
      return;
    }
    if (existing.count >= limit)
      throw new DomainError(
        'CHAT_RATE_LIMITED',
        'Too many chat requests. Please try again shortly.',
        429
      );
    existing.count += 1;
  }
}
