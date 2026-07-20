import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';

@Injectable()
export class HealthService {
  // Keep the readiness probe explicit so the Windows dev runner can be smoke-tested after rebuilds.
  public constructor(@InjectConnection() private readonly connection: Connection) {}
  liveness() {
    return { status: 'ok' as const, checks: { api: 'ok' as const, config: 'ok' as const } };
  }
  readiness() {
    // Mongoose exposes a numeric connection-state enum; 1 is its documented connected state.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
    if (this.connection.readyState !== 1)
      throw new ServiceUnavailableException({
        message: 'MongoDB is not ready.',
        issues: [{ mongo: 'disconnected' }]
      });
    return {
      status: 'ready' as const,
      checks: { api: 'ok' as const, config: 'ok' as const, mongo: 'ok' as const }
    };
  }
}
