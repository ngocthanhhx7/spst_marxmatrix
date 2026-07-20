import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { documentMetadataSchema } from '@marxmatrix/contracts';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DocumentsService } from '../../src/documents/documents.service.js';
import { Analysis } from '../../src/analyses/schemas/analysis.schema.js';
import { DocumentPageRecord } from '../../src/documents/schemas/document-page.schema.js';
import { DocumentRecord } from '../../src/documents/schemas/document.schema.js';

const dbName = `marxmatrix_documents_${process.pid}_${Date.now()}`;
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

describe('documents HTTP with isolated Mongo and GridFS', () => {
  it('enforces ownership across upload, metadata, pages, download and deletion', async () => {
    const register = async (email: string) =>
      request(server)
        .post('/api/v1/auth/register')
        .send({ email, password: 'correct horse battery staple', displayName: 'Document Student' })
        .expect(201);
    const owner = await register(`document-owner-${Date.now()}@example.test`);
    const other = await register(`document-other-${Date.now()}@example.test`);
    const authorization = { Authorization: `Bearer ${owner.body.accessToken as string}` };
    const uploaded = await request(server)
      .post('/api/v1/documents')
      .set(authorization)
      .field('title', 'Vietnamese report')
      .field('type', 'financial_report')
      .attach('file', Buffer.from('%PDF-1.7\nfixture'), {
        filename: 'bao-cao.pdf',
        contentType: 'application/pdf'
      })
      .expect(201);
    const metadata = documentMetadataSchema.parse(uploaded.body as unknown);
    expect(metadata).toMatchObject({
      status: 'uploaded',
      mimeType: 'application/pdf',
      pageCount: 0
    });
    const id = metadata.id;
    const duplicate = await request(server)
      .post('/api/v1/documents')
      .set(authorization)
      .field('title', 'Same bytes')
      .field('type', 'financial_report')
      .attach('file', Buffer.from('%PDF-1.7\nfixture'), {
        filename: 'copy.pdf',
        contentType: 'application/pdf'
      })
      .expect(201);
    expect(duplicate.body.id).toBe(id);
    const connection = app.get<{
      db: { collection(name: string): { countDocuments(filter?: unknown): Promise<number> } };
    }>('DatabaseConnection');
    await expect(connection.db.collection('uploads.files').countDocuments()).resolves.toBe(1);
    await request(server)
      .post('/api/v1/documents')
      .set(authorization)
      .field('title', 'bad')
      .field('type', 'financial_report')
      .attach('file', Buffer.from('not a PDF'), {
        filename: 'bad.pdf',
        contentType: 'application/pdf'
      })
      .expect(400);
    await request(server)
      .post('/api/v1/documents')
      .set(authorization)
      .field('title', 'bad')
      .field('type', 'financial_report')
      .attach('file', Buffer.from('%PDF-1.7'), {
        filename: 'bad.txt',
        contentType: 'application/pdf'
      })
      .expect(400);
    await request(server)
      .post('/api/v1/documents')
      .set(authorization)
      .field('title', 'bad')
      .field('type', 'financial_report')
      .attach('file', Buffer.from('%PDF-1.7'), { filename: 'bad.pdf', contentType: 'text/plain' })
      .expect(400);
    await request(server)
      .get('/api/v1/documents')
      .set(authorization)
      .expect(200)
      .expect(({ body }) => expect(body).toHaveLength(1));
    await request(server)
      .get(`/api/v1/documents/${id}`)
      .set({ Authorization: `Bearer ${other.body.accessToken as string}` })
      .expect(404);
    await request(server)
      .get(`/api/v1/documents/${id}/status`)
      .set(authorization)
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('uploaded'));

    const documents = app.get(DocumentsService);
    await expect(
      documents.parseDocument(id, {
        extract: () => Promise.resolve([{ pageNumber: 1, text: 'Persisted page' }])
      } as never)
    ).resolves.toBe('completed');
    const pageModel = app.get<{
      findOne(filter: unknown): { lean(): Promise<{ pageNumber: number; text: string } | null> };
    }>(getModelToken(DocumentPageRecord.name));
    const documentModel = app.get<{
      findById(id: string): {
        select(fields: string): { lean(): Promise<{ parsedPageToken: string } | null> };
      };
    }>(getModelToken(DocumentRecord.name));
    const parsedDocument = await documentModel.findById(id).select('+parsedPageToken').lean();
    if (parsedDocument === null) throw new Error('Parsed document fixture was not found.');
    await expect(
      pageModel.findOne({ documentId: id, pageNumber: 1 }).lean()
    ).resolves.toMatchObject({ text: 'Persisted page' });
    const pageResponse = await request(server)
      .get(`/api/v1/documents/${id}/pages/1`)
      .set(authorization);
    expect(pageResponse.body).toMatchObject({ text: 'Persisted page' });
    expect(pageResponse.body.text).toBe('Persisted page');
    const analysisModel = app.get<{
      create(input: unknown): Promise<unknown>;
    }>(getModelToken(Analysis.name));
    const queuedAnalysis = (await analysisModel.create({
      ownerId: owner.body.user.id,
      title: 'Queued extraction analysis',
      facts: [],
      assumptions: {
        revenueAdjustment: 1,
        includeSurplusProxy: false,
        contractorClassification: 'constant_capital',
        includeStockCompensation: false,
        includeNeedsReview: false,
        notes: ''
      },
      calculationVersions: [],
      finalized: false,
      stateVersion: 0,
      nextCalculationVersion: 1
    })) as { _id: { toString(): string } };
    const queueBody = { analysisId: queuedAnalysis._id.toString() };
    await request(server)
      .post(`/api/v1/documents/${id}/extractions`)
      .set(authorization)
      .send(queueBody)
      .expect(201)
      .expect(({ body }) =>
        expect(body).toEqual({ status: 'queued', documentId: id, analysisId: queueBody.analysisId })
      );
    await request(server)
      .post(`/api/v1/documents/${id}/extractions`)
      .set(authorization)
      .send(queueBody)
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('queued'));
    await expect(
      connection.db.collection('jobs').countDocuments({ type: 'extract_financials' })
    ).resolves.toBe(1);
    await request(server)
      .post(`/api/v1/documents/${id}/extractions`)
      .set({ Authorization: `Bearer ${other.body.accessToken as string}` })
      .send(queueBody)
      .expect(404);

    const completedAnalysis = (await analysisModel.create({
      ownerId: owner.body.user.id,
      title: 'Evidence analysis',
      facts: [
        {
          key: 'revenue',
          label: 'Revenue',
          value: 100,
          currency: 'USD',
          scale: 'millions',
          reportingPeriod: 'FY2025',
          classification: 'needs_review',
          extractionMode: 'ai_extracted',
          sourcePage: 1,
          sourceChunkId: '507f1f77bcf86cd799439011',
          evidenceText: 'Persisted page',
          classificationReason: 'Reported value',
          reviewStatus: 'pending_review',
          sensitivityCategory: 'standard',
          sensitivityClassification: null
        }
      ],
      assumptions: {
        revenueAdjustment: 1,
        includeSurplusProxy: false,
        contractorClassification: 'constant_capital',
        includeStockCompensation: false,
        includeNeedsReview: false,
        notes: ''
      },
      calculationVersions: [],
      finalized: false,
      stateVersion: 0,
      nextCalculationVersion: 1,
      financialExtractionDocumentId: id,
      financialExtractionFingerprint: 'test-fingerprint',
      financialExtractionParseToken: parsedDocument.parsedPageToken,
      financialExtractionSimulated: true,
      financialExtractionModel: 'mock-financial-extraction',
      financialExtractionPromptVersion: 'financial-extraction-v1',
      financialExtractionUsage: { totalTokens: 1 }
    })) as { _id: { toString(): string } };
    await request(server)
      .post(`/api/v1/documents/${id}/extractions`)
      .set(authorization)
      .send({ analysisId: completedAnalysis._id.toString() })
      .expect(201)
      .expect(({ body }) => expect(body.status).toBe('already-complete'));
    await request(server)
      .get(`/api/v1/documents/${id}/extractions`)
      .set(authorization)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toMatchObject({
          facts: [
            {
              label: 'Revenue',
              sourcePage: 1,
              evidenceText: 'Persisted page',
              reviewStatus: 'pending_review'
            }
          ],
          simulated: true,
          model: 'mock-financial-extraction',
          promptVersion: 'financial-extraction-v1',
          usage: { totalTokens: 1 }
        })
      );
    await request(server)
      .get(`/api/v1/documents/${id}/extractions`)
      .set({ Authorization: `Bearer ${other.body.accessToken as string}` })
      .expect(404);
    await request(server)
      .get(`/api/v1/documents/${id}/pages/1`)
      .set({ Authorization: `Bearer ${other.body.accessToken as string}` })
      .expect(404);
    await request(server)
      .get(`/api/v1/documents/${id}/download`)
      .set({ Authorization: `Bearer ${other.body.accessToken as string}` })
      .expect(404);
    await request(server)
      .get(`/api/v1/documents/${id}/download`)
      .set(authorization)
      .expect('Content-Type', /application\/pdf/)
      .expect(200);
    await request(server)
      .delete(`/api/v1/documents/${id}`)
      .set({ Authorization: `Bearer ${other.body.accessToken as string}` })
      .expect(404);
    await request(server).delete(`/api/v1/documents/${id}`).set(authorization).expect(204);
    await request(server)
      .get('/api/v1/documents')
      .set(authorization)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual([]));
    await expect(pageModel.findOne({ documentId: id, pageNumber: 1 }).lean()).resolves.toBeNull();
    await expect(connection.db.collection('uploads.files').countDocuments()).resolves.toBe(0);
  }, 30_000);
});
