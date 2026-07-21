import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ApplicationConfigModule } from './config/config.module.js';
import { HealthModule } from './health/health.module.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { DatabaseModule } from './database/database.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { AnalysesModule } from './analyses/analyses.module.js';
import { DocumentsModule } from './documents/documents.module.js';
import { RagModule } from './rag/rag.module.js';
import { AdminModule } from './admin/admin.module.js';
import { RoomsModule } from './rooms/rooms.module.js';
import { ArenaModule, ArenaRealtimeModule } from './arena/arena.module.js';
import { ChatModule } from './chat/chat.module.js';

@Module({
  imports: [
    ApplicationConfigModule,
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.getOrThrow<number>('RATE_LIMIT_TTL_MS'),
            limit: config.getOrThrow<number>('RATE_LIMIT_MAX')
          }
        ]
      })
    }),
    ObservabilityModule,
    DatabaseModule,
    IdentityModule,
    AnalysesModule,
    DocumentsModule,
    RagModule,
    AdminModule,
    ArenaRealtimeModule,
    RoomsModule,
    ArenaModule,
    ChatModule,
    HealthModule
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
})
export class AppModule {}
