import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Model } from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RefreshSession } from '../../src/identity/schemas/refresh-session.schema.js';

const dbName = `marxmatrix_identity_${process.pid}_${Date.now()}`;
const environment: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '3000',
  FRONTEND_URL: 'http://localhost:5173',
  CORS_ORIGINS: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://127.0.0.1:27017',
  MONGODB_DB_NAME: dbName,
  GRIDFS_BUCKET_NAME: 'uploads',
  JWT_ACCESS_SECRET: 'test-access-secret-that-is-long-enough',
  JWT_REFRESH_SECRET: 'test-refresh-secret-that-is-long-enough',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL: '7d',
  JWT_REFRESH_MAX_AGE_MS: '604800000',
  AUTH_COOKIE_NAME: 'marxmatrix_refresh',
  AUTH_COOKIE_SAME_SITE: 'lax',
  COOKIE_SECURE: 'false',
  AI_PROVIDER: 'mock',
  AI_REQUEST_TIMEOUT_MS: '15000',
  AI_MAX_RETRIES: '2',
  DOCUMENT_MAX_SIZE_MB: '20',
  DOCUMENT_ALLOWED_MIME_TYPES: 'application/pdf',
  RATE_LIMIT_TTL_MS: '60000',
  RATE_LIMIT_MAX: '100',
  LOG_LEVEL: 'error',
  DEMO_MODE: 'false'
};
let app: INestApplication;
let server: ReturnType<INestApplication['getHttpServer']>;
let sessions: Model<RefreshSession>;
beforeAll(async () => {
  Object.assign(process.env, environment);
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApplication } = await import('../../src/main.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApplication(app);
  await app.init();
  server = app.getHttpServer();
  sessions = app.get<Model<RefreshSession>>(getModelToken(RefreshSession.name));
}, 30_000);
afterAll(async () => {
  const connection = app.get<{ dropDatabase(): Promise<void> }>('DatabaseConnection');
  await connection.dropDatabase();
  await app.close();
});
describe('identity HTTP with isolated Mongo', () => {
  it('registers, authenticates, rotates refresh cookies, rejects replay, and logs out', async () => {
    const email = `student-${Date.now()}@example.test`;
    const registration = await request(server)
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:5173')
      .send({
        email: ` ${email.toUpperCase()} `,
        password: 'correct horse battery staple',
        displayName: 'Sinh viên'
      })
      .expect(201);
    expect(registration.body).toMatchObject({
      accessToken: expect.any(String),
      user: { email, role: 'student' }
    });
    expect(registration.body).not.toHaveProperty('passwordHash');
    const firstCookie = registration.headers['set-cookie']?.[0];
    if (firstCookie === undefined) throw new Error('Refresh cookie was not set.');
    expect(firstCookie).toContain('HttpOnly');
    await request(server)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://attacker.example')
      .send({ email, password: 'correct horse battery staple' })
      .expect(403)
      .expect(({ body }) => expect(body).toMatchObject({ code: 'HTTP_ERROR' }));
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: 'correct horse battery staple' })
      .expect(200);
    expect(login.body).toMatchObject({ accessToken: expect.any(String), user: { email } });
    const loginCookie = login.headers['set-cookie']?.[0];
    if (loginCookie === undefined) throw new Error('Login refresh cookie was not set.');
    await request(server).post('/api/v1/auth/logout').set('Cookie', firstCookie).expect(201);
    await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken as string}`)
      .expect(200)
      .expect(({ body }) => expect(body.user.email).toBe(email));
    const duplicate = await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: 'correct horse battery staple', displayName: 'Again' })
      .expect(409);
    expect(duplicate.body).toMatchObject({ code: 'HTTP_ERROR' });
    const wrong = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: 'incorrect password' })
      .expect(401);
    const unknown = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: 'unknown@example.test', password: 'incorrect password' })
      .expect(401);
    expect(wrong.body.message).toBe(unknown.body.message);
    const [rotated, replay] = await Promise.all([
      request(server).post('/api/v1/auth/refresh').set('Cookie', loginCookie),
      request(server).post('/api/v1/auth/refresh').set('Cookie', loginCookie)
    ]);
    expect([rotated.status, replay.status].sort()).toEqual([201, 401]);
    const winner = rotated.status === 201 ? rotated : replay;
    const secondCookie = winner.headers['set-cookie']?.[0];
    if (secondCookie === undefined) throw new Error('Rotated refresh cookie was not set.');
    expect(secondCookie).not.toBe(loginCookie);
    expect(await sessions.countDocuments({ revokedAt: { $exists: false } })).toBe(1);
    await request(server).post('/api/v1/auth/refresh').set('Cookie', loginCookie).expect(401);
    await request(server).post('/api/v1/auth/logout').set('Cookie', secondCookie).expect(201);
    await request(server).post('/api/v1/auth/refresh').set('Cookie', secondCookie).expect(401);
  }, 30_000);
});
