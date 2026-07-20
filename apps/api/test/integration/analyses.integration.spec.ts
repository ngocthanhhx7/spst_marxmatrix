import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { analysisDetailSchema } from '@marxmatrix/contracts';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dbName = `marxmatrix_analyses_${process.pid}_${Date.now()}`;
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
const fact = (key: string, value: number, classification: string, reviewStatus = 'approved') => ({
  key,
  label: key,
  value,
  currency: 'USD',
  scale: 'millions',
  reportingPeriod: 'FY2025',
  classification,
  extractionMode: 'manual',
  sourcePage: null,
  sourceChunkId: null,
  evidenceText: 'Synthetic fixture evidence.',
  classificationReason: 'Manual accounting proxy classification.',
  reviewStatus
});
let app: INestApplication;
let server: ReturnType<INestApplication['getHttpServer']>;
beforeAll(async () => {
  Object.assign(process.env, environment);
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApplication } = await import('../../src/main.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApplication(app);
  await app.init();
  server = app.getHttpServer();
}, 30_000);
afterAll(async () => {
  if (app === undefined) return;
  await app.get<{ dropDatabase(): Promise<void> }>('DatabaseConnection').dropDatabase();
  await app.close();
});
describe('analyses HTTP with isolated Mongo', () => {
  it('creates, lists, owns, updates, calculates and preserves immutable versions', async () => {
    const register = async (email: string) =>
      request(server)
        .post('/api/v1/auth/register')
        .send({ email, password: 'correct horse battery staple', displayName: 'Scanner Student' })
        .expect(201);
    const owner = await register(`owner-${Date.now()}@example.test`);
    const other = await register(`other-${Date.now()}@example.test`);
    const authorization = { Authorization: `Bearer ${owner.body.accessToken as string}` };
    const created = await request(server)
      .post('/api/v1/analyses')
      .set(authorization)
      .send({
        title: 'Cloud Platform 2025',
        facts: [
          { ...fact('revenue', 1000, 'revenue'), id: '507f1f77bcf86cd799439011' },
          fact('c', 400, 'constant_capital'),
          fact('v', 200, 'variable_capital')
        ],
        assumptions: { revenueAdjustment: 1, includeSurplusProxy: false, notes: '' }
      })
      .expect(201);
    expect(created.body.title).toBe('Cloud Platform 2025');
    expect(created.body.finalized).toBe(false);
    const id = created.body.id as string;
    const capitalFactId = created.body.facts[1].id as string;
    expect(capitalFactId).toMatch(/^[a-f\d]{24}$/i);
    expect(created.body.facts[0].id).not.toBe('507f1f77bcf86cd799439011');
    await request(server)
      .get('/api/v1/analyses')
      .set(authorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(1);
        expect(body[0]).toMatchObject({ id, title: 'Cloud Platform 2025' });
        expect(body[0]).not.toHaveProperty('facts');
      });
    await request(server)
      .get(`/api/v1/analyses/${id}`)
      .set({ Authorization: `Bearer ${other.body.accessToken as string}` })
      .expect(404);
    await request(server)
      .patch(`/api/v1/analyses/${id}/facts/${capitalFactId}`)
      .set({ Authorization: `Bearer ${other.body.accessToken as string}` })
      .send({ classification: 'variable_capital', reviewStatus: 'reclassified' })
      .expect(404);
    const factChanged = await request(server)
      .patch(`/api/v1/analyses/${id}/facts/${capitalFactId}`)
      .set(authorization)
      .send({ classification: 'variable_capital', reviewStatus: 'reclassified' })
      .expect(200);
    expect(factChanged.body.facts[1]).toMatchObject({
      id: capitalFactId,
      classification: 'variable_capital'
    });
    const policyChanged = await request(server)
      .patch(`/api/v1/analyses/${id}/assumptions`)
      .set(authorization)
      .send({
        revenueAdjustment: 0.9,
        includeSurplusProxy: false,
        contractorClassification: 'variable_capital',
        includeStockCompensation: true,
        includeNeedsReview: true,
        notes: 'Stress case'
      })
      .expect(200);
    expect(policyChanged.body.assumptions).toMatchObject({
      contractorClassification: 'variable_capital',
      includeStockCompensation: true,
      includeNeedsReview: true
    });
    const firstCalculation = await request(server)
      .post(`/api/v1/analyses/${id}/calculate`)
      .set(authorization)
      .send({})
      .expect(201);
    expect(firstCalculation.body.calculationVersions).toHaveLength(1);
    expect(firstCalculation.body.calculationVersions[0].result.evidenceCoverage).toBe(100);
    expect(firstCalculation.body.calculationVersions[0].result.surplusValue).toBe(300);
    const secondCalculation = await request(server)
      .post(`/api/v1/analyses/${id}/calculate`)
      .set(authorization)
      .send({})
      .expect(201);
    expect(secondCalculation.body.calculationVersions).toHaveLength(2);
    expect(secondCalculation.body.calculationVersions[0].result).toEqual(
      firstCalculation.body.calculationVersions[0].result
    );
    expect(secondCalculation.body.calculationVersions[1].result.surplusValue).toBe(300);
    await request(server)
      .get(`/api/v1/analyses/${id}/versions`)
      .set(authorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toHaveLength(2);
        expect(body[0].id).toMatch(/^[a-f\d]{24}$/i);
      });
    await request(server)
      .get(`/api/v1/analyses/${id}/versions`)
      .set({ Authorization: `Bearer ${other.body.accessToken as string}` })
      .expect(404);
    const final = await request(server)
      .post(`/api/v1/analyses/${id}/finalize`)
      .set(authorization)
      .send({})
      .expect(201);
    expect(final.body.calculationVersions).toHaveLength(3);
    expect(final.body.finalized).toBe(true);
    expect(final.body.calculationVersions[0].result).toEqual(
      firstCalculation.body.calculationVersions[0].result
    );
    expect(final.body.calculationVersions[1].result).toEqual(
      secondCalculation.body.calculationVersions[1].result
    );
    await request(server)
      .patch(`/api/v1/analyses/${id}/facts/${capitalFactId}`)
      .set(authorization)
      .send({ classification: 'constant_capital' })
      .expect(409);
    await request(server)
      .patch(`/api/v1/analyses/${id}/assumptions`)
      .set(authorization)
      .send({
        revenueAdjustment: 0.8,
        includeSurplusProxy: false,
        contractorClassification: 'constant_capital',
        includeStockCompensation: false,
        includeNeedsReview: false,
        notes: ''
      })
      .expect(409);
    await request(server)
      .post(`/api/v1/analyses/${id}/calculate`)
      .set(authorization)
      .send({})
      .expect(409);
    await request(server)
      .get(`/api/v1/analyses/${id}`)
      .set(authorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body.calculationVersions).toHaveLength(3);
        expect(body.calculationVersions[0].result.surplusValue).toBe(300);
        expect(body.calculationVersions[1].result.surplusValue).toBe(300);
      });
  }, 30_000);

  it('deduplicates idempotent creates and calculations and rejects stale concurrent writes', async () => {
    const register = async (email: string) =>
      request(server)
        .post('/api/v1/auth/register')
        .send({ email, password: 'correct horse battery staple', displayName: 'Scanner Student' })
        .expect(201);
    const owner = await register(`reliable-owner-${Date.now()}@example.test`);
    const other = await register(`reliable-other-${Date.now()}@example.test`);
    const authorization = { Authorization: `Bearer ${owner.body.accessToken as string}` };
    const createKey = `create-${Date.now()}`;
    const payload = {
      title: 'Reliable analysis',
      facts: [
        fact('revenue', 1000, 'revenue'),
        fact('c', 400, 'constant_capital'),
        fact('v', 200, 'variable_capital')
      ],
      assumptions: {
        revenueAdjustment: 1,
        includeSurplusProxy: false,
        contractorClassification: 'constant_capital',
        includeStockCompensation: false,
        includeNeedsReview: false,
        notes: ''
      }
    };
    const [created, retried] = await Promise.all([
      request(server)
        .post('/api/v1/analyses')
        .set(authorization)
        .set('Idempotency-Key', createKey)
        .send(payload),
      request(server)
        .post('/api/v1/analyses')
        .set(authorization)
        .set('Idempotency-Key', createKey)
        .send(payload)
    ]);
    expect([created.status, retried.status]).toEqual([201, 201]);
    expect(created.body.id).toBe(retried.body.id);
    const id = created.body.id as string;
    await request(server)
      .post('/api/v1/analyses')
      .set(authorization)
      .set('Idempotency-Key', createKey)
      .send({ ...payload, title: 'Different create intent' })
      .expect(409);
    await request(server)
      .get('/api/v1/analyses')
      .set(authorization)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));

    const otherCreated = await request(server)
      .post('/api/v1/analyses')
      .set({ Authorization: `Bearer ${other.body.accessToken as string}` })
      .set('Idempotency-Key', createKey)
      .send(payload)
      .expect(201);
    expect(otherCreated.body.id).not.toBe(id);

    await request(server)
      .patch(`/api/v1/analyses/${id}/assumptions`)
      .set(authorization)
      .send({ revenueAdjustment: 0.9 })
      .expect(400);

    const calculationKey = `calculate-${Date.now()}`;
    const first = await request(server)
      .post(`/api/v1/analyses/${id}/calculate`)
      .set(authorization)
      .set('Idempotency-Key', calculationKey)
      .send({})
      .expect(201);
    const retry = await request(server)
      .post(`/api/v1/analyses/${id}/calculate`)
      .set(authorization)
      .set('Idempotency-Key', calculationKey)
      .send({})
      .expect(201);
    expect(retry.body.calculationVersions).toHaveLength(1);
    expect(retry.body.calculationVersions[0].id).toBe(first.body.calculationVersions[0].id);
    await request(server)
      .post(`/api/v1/analyses/${id}/finalize`)
      .set(authorization)
      .set('Idempotency-Key', calculationKey)
      .send({})
      .expect(409);

    const concurrent = await Promise.all([
      request(server)
        .post(`/api/v1/analyses/${id}/calculate`)
        .set(authorization)
        .set('Idempotency-Key', `concurrent-a-${Date.now()}`)
        .send({}),
      request(server)
        .post(`/api/v1/analyses/${id}/calculate`)
        .set(authorization)
        .set('Idempotency-Key', `concurrent-b-${Date.now()}`)
        .send({})
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([201, 409]);
    const current = await request(server)
      .get(`/api/v1/analyses/${id}`)
      .set(authorization)
      .expect(200);
    const currentBody = analysisDetailSchema.parse(current.body as unknown);
    expect(currentBody.calculationVersions.map((version) => version.version)).toEqual([1, 2]);
  }, 30_000);

  it('gates a pending manual needs-review fact through the HTTP calculation policy', async () => {
    const owner = await request(server)
      .post('/api/v1/auth/register')
      .send({
        email: `review-policy-${Date.now()}@example.test`,
        password: 'correct horse battery staple',
        displayName: 'Review Policy Student'
      })
      .expect(201);
    const authorization = { Authorization: `Bearer ${owner.body.accessToken as string}` };
    const created = await request(server)
      .post('/api/v1/analyses')
      .set(authorization)
      .set('Idempotency-Key', `review-create-${Date.now()}`)
      .send({
        title: 'Review policy analysis',
        facts: [
          fact('revenue', 1000, 'revenue'),
          fact('c', 400, 'constant_capital'),
          fact('v', 200, 'variable_capital'),
          {
            ...fact('manual-review', 100, 'needs_review', 'pending_review'),
            sensitivityClassification: 'variable_capital'
          }
        ],
        assumptions: {
          revenueAdjustment: 1,
          includeSurplusProxy: false,
          contractorClassification: 'constant_capital',
          includeStockCompensation: false,
          includeNeedsReview: false,
          notes: ''
        }
      })
      .expect(201);
    const id = created.body.id as string;
    const excluded = await request(server)
      .post(`/api/v1/analyses/${id}/calculate`)
      .set(authorization)
      .set('Idempotency-Key', `review-excluded-${Date.now()}`)
      .send({})
      .expect(201);
    expect(excluded.body.calculationVersions[0].result.variableCapital).toBe(200);

    await request(server)
      .patch(`/api/v1/analyses/${id}/assumptions`)
      .set(authorization)
      .send({
        revenueAdjustment: 1,
        includeSurplusProxy: false,
        contractorClassification: 'constant_capital',
        includeStockCompensation: false,
        includeNeedsReview: true,
        notes: ''
      })
      .expect(200);
    const included = await request(server)
      .post(`/api/v1/analyses/${id}/calculate`)
      .set(authorization)
      .set('Idempotency-Key', `review-included-${Date.now()}`)
      .send({})
      .expect(201);
    expect(included.body.calculationVersions[1].result.variableCapital).toBe(300);
  }, 30_000);
});
