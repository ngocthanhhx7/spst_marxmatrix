import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from './authenticated-user.js';

@Injectable()
export class TokenService {
  public constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}
  async accessToken(user: AuthenticatedUser): Promise<string> {
    const configuredTtl = this.config.getOrThrow<string>('JWT_ACCESS_TTL');
    const expiresIn = /^\d+$/.test(configuredTtl) ? Number(configuredTtl) : configuredTtl;
    return this.jwt.signAsync(user, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: expiresIn as never
    });
  }
  newRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
  refreshExpiry(): Date {
    const ttl = this.config.getOrThrow<string>('JWT_REFRESH_TTL');
    const match = /^(\d+)(ms|s|m|h|d|w|y)?$/.exec(ttl);
    if (match === null || Number(match[1]) <= 0)
      throw new Error('JWT_REFRESH_TTL must be a positive supported duration.');
    const multipliers = {
      ms: 1,
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
      w: 604_800_000,
      y: 31_536_000_000
    } as const;
    return new Date(
      Date.now() + Number(match[1]) * multipliers[(match[2] ?? 's') as keyof typeof multipliers]
    );
  }
}
