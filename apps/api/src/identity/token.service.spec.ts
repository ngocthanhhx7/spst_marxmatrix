import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';
import { TokenService } from './token.service.js';

describe('TokenService', () => {
  it('normalizes a unitless access TTL to numeric seconds before signing', async () => {
    const jwt = new JwtService();
    const config = {
      getOrThrow: (key: string) =>
        key === 'JWT_ACCESS_SECRET' ? 'test-access-secret-that-is-long-enough' : '60'
    };
    const token = await new TokenService(jwt, config as never).accessToken({
      id: '507f1f77bcf86cd799439011',
      email: 'student@example.test',
      role: 'student'
    });
    const payload = jwt.decode<{ iat: number; exp: number }>(token);
    expect(payload.exp - payload.iat).toBe(60);
  });
});
