import { MiddlewareConsumer, Module, RequestMethod, type NestModule } from '@nestjs/common';
import { RequestIdMiddleware } from '../common/request-id.middleware.js';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({ controllers: [HealthController], providers: [HealthService] })
export class HealthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
