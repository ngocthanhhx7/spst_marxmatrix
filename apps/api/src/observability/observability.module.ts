import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { createLoggerOptions } from './logger.config.js';
import { RequestLoggingInterceptor } from './request-logging.interceptor.js';

@Global()
@Module({
  imports: [
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createLoggerOptions(config.getOrThrow<string>('LOG_LEVEL'))
    })
  ],
  providers: [RequestLoggingInterceptor],
  exports: [RequestLoggingInterceptor, LoggerModule]
})
export class ObservabilityModule {}
