import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded, type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { CorsSocketIoAdapter } from './common/socket-io.adapter.js';
import { ZodValidationPipe } from './common/zod-validation.pipe.js';
import { AppModule } from './app.module.js';
import { RequestLoggingInterceptor } from './observability/request-logging.interceptor.js';

export function configureApplication(app: INestApplication): INestApplication {
  const config = app.get(ConfigService);
  const logger = app.get(Logger);
  const httpInstance = app.getHttpAdapter().getInstance() as {
    set(name: string, value: unknown): void;
  };
  httpInstance.set('trust proxy', 'loopback');
  const corsOrigins = config
    .getOrThrow<string>('CORS_ORIGINS')
    .split(',')
    .map((origin) => origin.trim());
  app.useLogger(logger);
  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: corsOrigins,
    credentials: true
  });
  app.useWebSocketAdapter(new CorsSocketIoAdapter(app, corsOrigins));
  app.use(helmet());
  app.use(cookieParser(), json({ limit: '1mb' }), urlencoded({ extended: false, limit: '1mb' }));
  const allowedOrigins = new Set(
    [
      config.getOrThrow<string>('FRONTEND_URL'),
      ...config.getOrThrow<string>('CORS_ORIGINS').split(',')
    ].map((origin) => origin.trim())
  );
  app.use((request: Request, _response: Response, next: NextFunction) => {
    if (request.method !== 'POST' || !request.path.startsWith('/api/v1/auth/')) return next();
    const source = request.headers.origin ?? request.headers.referer;
    if (source === undefined && config.getOrThrow<string>('NODE_ENV') === 'test') return next();
    let origin: string | undefined;
    try {
      origin = source === undefined ? undefined : new URL(source).origin;
    } catch {
      origin = undefined;
    }
    if (origin === undefined || !allowedOrigins.has(origin))
      return next(new ForbiddenException('Request origin is not allowed.'));
    return next();
  });
  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(
    new AllExceptionsFilter(
      { isProduction: config.getOrThrow('NODE_ENV') === 'production' },
      logger
    )
  );
  app.useGlobalInterceptors(app.get(RequestLoggingInterceptor));
  const openApi = new DocumentBuilder().setTitle('MarxMatrix API').setVersion('v1').build();
  SwaggerModule.setup('api/v1/openapi', app, SwaggerModule.createDocument(app, openApi));
  app.enableShutdownHooks();
  return app;
}

export async function createApplication(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  return configureApplication(app);
}

async function bootstrap(): Promise<void> {
  const app = await createApplication();
  await app.listen(app.get(ConfigService).getOrThrow<number>('PORT'));
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && resolve(entrypoint) === fileURLToPath(import.meta.url)) {
  void bootstrap();
}
