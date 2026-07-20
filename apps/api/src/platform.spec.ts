import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  RequestMethod
} from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { readFile } from 'node:fs/promises';
import request from 'supertest';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DomainError } from './common/domain-error.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { parseEnvironment } from './config/env.schema.js';
import { createZodDto, ZodValidationPipe } from './common/zod-validation.pipe.js';
import {
  createLoggerOptions,
  loggerOptions,
  loggerRedaction
} from './observability/logger.config.js';

const demoEnvironment = {
  NODE_ENV: 'development',
  PORT: '3000',
  FRONTEND_URL: 'http://localhost:5173',
  CORS_ORIGINS: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://localhost:27017',
  MONGODB_DB_NAME: 'marxmatrix',
  GRIDFS_BUCKET_NAME: 'uploads',
  JWT_ACCESS_SECRET: 'local-access-secret-change-me',
  JWT_REFRESH_SECRET: 'local-refresh-secret-change-me',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
  AUTH_COOKIE_NAME: 'marxmatrix_refresh',
  COOKIE_SECURE: 'false',
  AI_PROVIDER: 'mock',
  AI_REQUEST_TIMEOUT_MS: '15000',
  AI_MAX_RETRIES: '2',
  DOCUMENT_MAX_SIZE_MB: '20',
  DOCUMENT_ALLOWED_MIME_TYPES: 'application/pdf',
  RATE_LIMIT_TTL_MS: '60000',
  RATE_LIMIT_MAX: '100',
  LOG_LEVEL: 'info',
  DEMO_MODE: 'true'
};

const selfHostedProductionEnvironment = {
  ...demoEnvironment,
  NODE_ENV: 'production',
  FRONTEND_URL: 'https://app.marxmatrix.example',
  CORS_ORIGINS: 'https://app.marxmatrix.example',
  MONGODB_URI: 'mongodb://127.0.0.1:27017',
  JWT_ACCESS_SECRET: '84a7c1e9d4f2b6a8c3e5f7d9b1a4c6e8f2d5a7c9',
  JWT_REFRESH_SECRET: '2f8c4a6e1d9b7c5e3a8f6d4b2c9e7a5f1d8c6b4',
  COOKIE_SECURE: 'true',
  AI_PROVIDER: 'gemini',
  GEMINI_API_KEY: 'gemini-production-key',
  RAG_VECTOR_PROVIDER: 'local',
  DEMO_MODE: 'false'
};

@Controller('test-error')
class TestErrorController {
  @Get()
  unexpected(): never {
    throw new Error('internal stack must not leak');
  }
}

class TestZodBody extends createZodDto(z.object({ name: z.string().min(2) })) {}

@Controller('test-zod')
class TestZodController {
  @Post()
  create(@Body() body: TestZodBody): { name: string } {
    return { name: body.name };
  }
}

describe('API platform', () => {
  it('defaults the API listener to loopback and permits an explicit container bind host', () => {
    expect(parseEnvironment(demoEnvironment).API_HOST).toBe('127.0.0.1');
    expect(parseEnvironment({ ...demoEnvironment, API_HOST: '0.0.0.0' }).API_HOST).toBe('0.0.0.0');
  });

  it('binds the Nest listener to the configured API host', async () => {
    const mainSource = await readFile(new URL('./main.ts', import.meta.url), 'utf8');

    expect(mainSource).toContain("getOrThrow<string>('API_HOST')");
  });

  it('uses the repository dev runner instead of the Nest CLI watch command', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    ) as {
      scripts?: Record<string, string>;
    };
    expect(packageJson.scripts?.['dev']).toBe('node scripts/dev-api.mjs');
    expect(packageJson.scripts?.['dev']).not.toContain('nest start --watch');
  });

  it('serializes API restarts so watch rebuilds cannot overlap server processes', async () => {
    const runner = await readFile(new URL('../scripts/dev-api.mjs', import.meta.url), 'utf8');
    expect(runner).toContain('await stopServer()');
    expect(runner).toContain('restartInProgress');
    expect(runner).toContain('taskkill');
  });

  it('runs the queue worker alongside the API during local development', async () => {
    const runner = await readFile(new URL('../scripts/dev-api.mjs', import.meta.url), 'utf8');

    expect(runner).toContain("'dist/worker.js'");
    expect(runner).toContain('await stopWorker()');
  });

  it('permits demo configuration without a Gemini key and rejects unsafe production configuration', () => {
    expect(parseEnvironment(demoEnvironment).GEMINI_API_KEY).toBeUndefined();
    expect(() =>
      parseEnvironment({
        ...demoEnvironment,
        NODE_ENV: 'production',
        DEMO_MODE: 'false',
        CORS_ORIGINS: '*',
        GEMINI_API_KEY: ''
      })
    ).toThrow(/CORS_ORIGINS|GEMINI_API_KEY/);
    expect(() =>
      parseEnvironment({
        ...demoEnvironment,
        NODE_ENV: 'production',
        DEMO_MODE: 'false',
        COOKIE_SECURE: 'true',
        AI_PROVIDER: 'gemini',
        GEMINI_API_KEY: ''
      })
    ).toThrow(/GEMINI_API_KEY/);
  });
  it.each([
    [
      'absent',
      {},
      { MONGODB_URI: 'mongodb+srv://database.example/marxmatrix' },
      'RAG_VECTOR_PROVIDER'
    ],
    [
      'explicitly false',
      { ALLOW_SELF_HOSTED_PRODUCTION: 'false' },
      { MONGODB_URI: 'mongodb+srv://database.example/marxmatrix' },
      'RAG_VECTOR_PROVIDER'
    ],
    ['absent', {}, { RAG_VECTOR_PROVIDER: 'atlas' }, 'MONGODB_URI'],
    [
      'explicitly false',
      { ALLOW_SELF_HOSTED_PRODUCTION: 'false' },
      { RAG_VECTOR_PROVIDER: 'atlas' },
      'MONGODB_URI'
    ]
  ])(
    'keeps the %s self-hosted production restriction for %s',
    (_flagMode, flag, override, expectedField) => {
      expect(() =>
        parseEnvironment({ ...selfHostedProductionEnvironment, ...flag, ...override })
      ).toThrow(new RegExp(expectedField));
    }
  );
  it('permits explicitly opted-in self-hosted production configuration', () => {
    const environment = parseEnvironment({
      ...selfHostedProductionEnvironment,
      ALLOW_SELF_HOSTED_PRODUCTION: 'true'
    });
    expect(environment).toMatchObject({
      ALLOW_SELF_HOSTED_PRODUCTION: true,
      MONGODB_URI: 'mongodb://127.0.0.1:27017',
      RAG_VECTOR_PROVIDER: 'local'
    });
  });
  it.each([
    'mongodb://user:pass@localhost:27017/marxmatrix',
    'mongodb://user:pass@[::1]:27017/marxmatrix'
  ])('permits standard self-hosted MongoDB URI %s', (mongodbUri) => {
    expect(
      parseEnvironment({
        ...selfHostedProductionEnvironment,
        ALLOW_SELF_HOSTED_PRODUCTION: 'true',
        MONGODB_URI: mongodbUri
      }).MONGODB_URI
    ).toBe(mongodbUri);
  });
  it.each(['mongodb+srv://localhost/marxmatrix', 'mongodb+srv://127.0.0.1/marxmatrix'])(
    'rejects SRV URI %s for self-hosted production',
    (mongodbUri) => {
      expect(() =>
        parseEnvironment({
          ...selfHostedProductionEnvironment,
          ALLOW_SELF_HOSTED_PRODUCTION: 'true',
          MONGODB_URI: mongodbUri
        })
      ).toThrow(/MONGODB_URI/);
    }
  );
  it.each([
    [
      'loopback MongoDB with Atlas vectors',
      { RAG_VECTOR_PROVIDER: 'atlas' },
      ['RAG_VECTOR_PROVIDER']
    ],
    [
      'remote MongoDB with local vectors',
      { MONGODB_URI: 'mongodb://db.example:27017/marxmatrix' },
      ['MONGODB_URI']
    ],
    [
      'remote MongoDB with Atlas vectors',
      {
        MONGODB_URI: 'mongodb://db.example:27017/marxmatrix',
        RAG_VECTOR_PROVIDER: 'atlas'
      },
      ['MONGODB_URI', 'RAG_VECTOR_PROVIDER']
    ]
  ])(
    'rejects self-hosted production topology with %s',
    (_description, override, expectedFields) => {
      expectedFields.forEach((field) => {
        expect(() =>
          parseEnvironment({
            ...selfHostedProductionEnvironment,
            ALLOW_SELF_HOSTED_PRODUCTION: 'true',
            ...override
          })
        ).toThrow(new RegExp(field));
      });
    }
  );
  it('rejects replica-set MongoDB authorities containing a loopback host in default production', () => {
    expect(() =>
      parseEnvironment({
        ...selfHostedProductionEnvironment,
        RAG_VECTOR_PROVIDER: 'atlas',
        MONGODB_URI: 'mongodb://db.example:27017,localhost:27017/marxmatrix'
      })
    ).toThrow(/MONGODB_URI/);
  });
  it.each([
    ['DEMO_MODE', { DEMO_MODE: 'true' }],
    ['AI_PROVIDER', { AI_PROVIDER: 'mock' }],
    ['GEMINI_API_KEY', { GEMINI_API_KEY: '' }],
    ['COOKIE_SECURE', { COOKIE_SECURE: 'false' }],
    ['CORS_ORIGINS', { CORS_ORIGINS: '*' }],
    ['JWT_ACCESS_SECRET', { JWT_ACCESS_SECRET: 'short-secret' }],
    ['JWT_REFRESH_SECRET', { JWT_REFRESH_SECRET: 'short-secret' }],
    [
      'JWT_ACCESS_SECRET',
      { JWT_ACCESS_SECRET: 'change-me-access-secret-that-is-over-thirty-two-characters' }
    ],
    [
      'JWT_REFRESH_SECRET',
      { JWT_REFRESH_SECRET: 'placeholder-refresh-secret-that-is-over-thirty-two-characters' }
    ],
    ['AUTH_COOKIE_SAME_SITE', { AUTH_COOKIE_SAME_SITE: 'none', COOKIE_SECURE: 'false' }]
  ])('keeps the %s production safeguard with self-hosted opt-in', (expectedField, override) => {
    expect(() =>
      parseEnvironment({
        ...selfHostedProductionEnvironment,
        ALLOW_SELF_HOSTED_PRODUCTION: 'true',
        ...override
      })
    ).toThrow(new RegExp(expectedField));
  });
  it('treats a copied blank Gemini key as absent in demo mode', () => {
    expect(
      parseEnvironment({ ...demoEnvironment, GEMINI_API_KEY: '   ' }).GEMINI_API_KEY
    ).toBeUndefined();
  });
  it.each(['60', '15m', '250ms', '1w', '1y'])('accepts supported JWT duration %s', (ttl) => {
    expect(
      parseEnvironment({ ...demoEnvironment, JWT_ACCESS_TTL: ttl, JWT_REFRESH_TTL: ttl })
        .JWT_ACCESS_TTL
    ).toBe(ttl);
  });
  it.each(['0', '-1', '0m', '15minutes', '1.5h'])('rejects invalid JWT duration %s', (ttl) => {
    expect(() => parseEnvironment({ ...demoEnvironment, JWT_ACCESS_TTL: ttl })).toThrow(
      /JWT_ACCESS_TTL/
    );
    expect(() => parseEnvironment({ ...demoEnvironment, JWT_REFRESH_TTL: ttl })).toThrow(
      /JWT_REFRESH_TTL/
    );
  });

  it.each(['mongodb://localhost:27017', 'mongodb://[::1]:27017'])(
    'rejects local MongoDB URI %s in production',
    (mongodbUri) => {
      expect(() =>
        parseEnvironment({
          ...selfHostedProductionEnvironment,
          RAG_VECTOR_PROVIDER: 'atlas',
          MONGODB_URI: mongodbUri
        })
      ).toThrow(/MONGODB_URI/);
    }
  );

  it('serializes domain and unexpected errors without exposing a production stack', () => {
    const filter = new AllExceptionsFilter({ isProduction: true });
    const response = { status: () => response, json: (body: unknown) => body };
    const requestLike = { id: '5db560db-86e6-4a08-a7c5-444a3311a7e8' };
    const host = {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => requestLike })
    };
    expect(
      filter.serialize(
        new DomainError('FACT_INVALID', 'Fact is invalid', 422, [{ field: 'value' }]),
        host as never
      )
    ).toEqual({
      statusCode: 422,
      code: 'FACT_INVALID',
      message: 'Fact is invalid',
      details: [{ field: 'value' }],
      requestId: requestLike.id
    });
    expect(filter.serialize(new Error('secret stack'), host as never)).not.toHaveProperty('stack');
    expect(() => new DomainError('', 'message', 400)).toThrow();
    expect(() => new DomainError('CODE', '', 400)).toThrow();
    expect(() => new DomainError('CODE', 'message', 200)).toThrow();
    expect(
      filter.serialize(new HttpException('bad', HttpStatus.BAD_REQUEST), host as never)
    ).toMatchObject({ statusCode: 400 });
    const zodFailure = z.object({ value: z.number() }).safeParse({ value: 'not-a-number' });
    if (!zodFailure.success) {
      expect(filter.serialize(zodFailure.error, host as never)).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR'
      });
    }
  });

  it('logs unexpected exceptions with their request ID without changing the sanitized response', () => {
    const logger = { error: vi.fn() };
    const filter = new AllExceptionsFilter({ isProduction: true }, logger);
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);
    const requestLike = { id: '5db560db-86e6-4a08-a7c5-444a3311a7e8' };
    const host = {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => requestLike })
    };
    const original = new Error('original failure');
    filter.catch(original, host as never);
    expect(logger.error).toHaveBeenCalledWith(
      { err: original, requestId: requestLike.id },
      'unexpected exception'
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        requestId: requestLike.id
      })
    );
    expect(response.json.mock.calls[0]?.[0]).not.toHaveProperty('stack');
    filter.catch(new DomainError('KNOWN', 'Known error', 400), host as never);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });
  it('serializes the original unexpected error in real Pino output while keeping the response safe', () => {
    let output = '';
    const logger = pino(
      {},
      {
        write: (line: string) => {
          output += line;
        }
      }
    );
    const filter = new AllExceptionsFilter({ isProduction: true }, logger);
    const response = { status: () => response, json: vi.fn() };
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ id: '5db560db-86e6-4a08-a7c5-444a3311a7e8' })
      })
    };
    filter.catch(new Error('captured original failure'), host as never);
    const entry = JSON.parse(output) as { err: { type: string; message: string; stack: string } };
    expect(entry.err).toMatchObject({ type: 'Error', message: 'captured original failure' });
    expect(entry.err.stack).toContain('captured original failure');
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'INTERNAL_ERROR' }));
  });
  it('normalizes malformed HttpExceptions into contract-valid errors', () => {
    const filter = new AllExceptionsFilter({ isProduction: true });
    const response = { status: vi.fn(), json: vi.fn() };
    response.status.mockReturnValue(response);
    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => ({ id: '5db560db-86e6-4a08-a7c5-444a3311a7e8' })
      })
    };
    expect(filter.serialize(new HttpException('', 400), host as never)).toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_ERROR'
    });
    expect(filter.serialize(new HttpException({ message: '' }, 200), host as never)).toMatchObject({
      statusCode: 500,
      code: 'INTERNAL_ERROR'
    });
    expect(filter.serialize(new HttpException('Bad input', 400), host as never)).toMatchObject({
      statusCode: 400,
      code: 'HTTP_ERROR',
      message: 'Bad input'
    });
    filter.catch(new HttpException('', 400), host as never);
    expect(response.status).toHaveBeenCalledWith(500);
    filter.catch(new HttpException('Bad input', 400), host as never);
    expect(response.status).toHaveBeenLastCalledWith(400);
  });

  it('redacts nested credentials from structured Pino logs', () => {
    expect(loggerRedaction.paths).toContain('req.headers.authorization');
    expect(loggerRedaction.paths).toContain('*.password');
    expect(loggerRedaction.paths).toContain('accessToken');
    expect(loggerRedaction.paths).toContain('req.headers.x-api-key');
    expect(loggerRedaction.paths).toContain('GEMINI_API_KEY');
    expect(loggerRedaction.paths).toContain('geminiApiKey');
    expect(loggerOptions.pinoHttp).toMatchObject({ level: 'info' });
  });

  it('configures Pino with an Express 5-compatible catch-all route', () => {
    expect(loggerOptions.forRoutes).toEqual([{ path: '{*path}', method: RequestMethod.ALL }]);
    expect(createLoggerOptions('debug').forRoutes).toEqual(loggerOptions.forRoutes);
  });

  it('applies production wiring, global Zod validation, throttling, and prefixed health routes', async () => {
    const priorEnvironment = { ...process.env };
    Object.assign(process.env, { ...demoEnvironment, RATE_LIMIT_MAX: '2' });
    const { AppModule } = await import('./app.module.js');
    const { configureApplication } = await import('./main.js');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestErrorController, TestZodController]
    }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApplication(app);
    expect(app.getHttpAdapter().getInstance().get('trust proxy')).toBe('loopback');
    await app.init();
    const server = app.getHttpServer();
    await request(server)
      .post('/api/v1/auth/refresh')
      .expect(403)
      .expect(({ body }) => expect(body).toMatchObject({ statusCode: 403, code: 'HTTP_ERROR' }));
    await request(server)
      .post('/api/v1/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .expect(401);
    const unexpected = await request(server).get('/api/v1/test-error').expect(500);
    expect(unexpected.body).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' });
    expect(unexpected.body).not.toHaveProperty('stack');
    const invalidZod = await request(server)
      .post('/api/v1/test-zod')
      .send({ name: 'x' })
      .expect(400);
    expect(invalidZod.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    const invalidZodBody = invalidZod.body as unknown as { details?: ReadonlyArray<unknown> };
    expect(invalidZodBody.details).not.toHaveLength(0);
    await request(server)
      .post('/api/v1/test-zod')
      .send({ name: 'Marx' })
      .expect(201)
      .expect({ name: 'Marx' });
    await request(server)
      .get('/api/v1/health')
      .expect(200)
      .expect({ status: 'ok', checks: { api: 'ok', config: 'ok' } });
    await request(server)
      .get('/api/v1/ready')
      .expect(200)
      .expect({ status: 'ready', checks: { api: 'ok', config: 'ok', mongo: 'ok' } });
    await request(server)
      .get('/socket.io/?EIO=4&transport=polling')
      .set('Origin', 'http://localhost:5173')
      .expect('access-control-allow-origin', 'http://localhost:5173')
      .expect('access-control-allow-credentials', 'true')
      .expect(200);
    const generated = await request(server).get('/api/v1/health').expect(200);
    expect(generated.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    const received = await request(server)
      .get('/api/v1/health')
      .set('x-request-id', '5db560db-86e6-4a08-a7c5-444a3311a7e8')
      .expect(429);
    expect(received.headers['x-request-id']).toBe('5db560db-86e6-4a08-a7c5-444a3311a7e8');
    const internalApplication = app as unknown as {
      config: { getGlobalPipes(): ReadonlyArray<unknown> };
    };
    expect(internalApplication.config.getGlobalPipes()).toContainEqual(
      expect.any(ZodValidationPipe)
    );
    await app.close();
    Object.keys(process.env).forEach((key) => {
      if (!(key in priorEnvironment)) delete process.env[key];
    });
    Object.assign(process.env, priorEnvironment);
  }, 15_000);
});
