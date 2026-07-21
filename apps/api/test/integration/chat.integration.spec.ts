import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { ChatProvider } from '../../src/chat/chat-provider.js';
import { CHAT_PROVIDER } from '../../src/chat/chat-provider.js';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const dbName = `marxmatrix_chat_${process.pid}_${Date.now()}`;
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
  CHAT_ENABLED: 'false',
  GEMINI_CHAT_MODEL: '',
  CHAT_AI_TIMEOUT_MS: '15000',
  CHAT_AI_MAX_RETRIES: '0',
  CHAT_MAX_CONTEXT_MESSAGES: '20',
  CHAT_MAX_CONTEXT_BYTES: '100000',
  CHAT_MAX_RUN_AGE_MS: '180000',
  CHAT_RATE_LIMIT_PER_MINUTE: '100',
  LOG_LEVEL: 'error',
  DEMO_MODE: 'false'
};

const png = await sharp({
  create: { width: 2, height: 2, channels: 3, background: { r: 30, g: 130, b: 180 } }
})
  .png()
  .toBuffer();

const provider: ChatProvider = {
  classify(input) {
    return Promise.resolve(
      input.text.includes('bóng đá')
        ? { domain: 'out_of_scope', confidence: 1 }
        : { domain: 'finance', confidence: 1 }
    );
  },
  generate(input, scope) {
    return Promise.resolve({
      answer: `Đã phân tích: ${input.text || 'hình ảnh'}.`,
      scope,
      model: 'integration-fake',
      promptVersion: 'integration-v1',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    });
  },
  validateOutput() {
    return Promise.resolve(true);
  }
};

let app: INestApplication;
let server: ReturnType<INestApplication['getHttpServer']>;

beforeAll(async () => {
  Object.assign(process.env, environment);
  const { AppModule } = await import('../../src/app.module.js');
  const { configureApplication } = await import('../../src/main.js');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CHAT_PROVIDER)
    .useValue(provider)
    .compile();
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

async function register(email: string) {
  const response = await request(server)
    .post('/api/v1/auth/register')
    .send({ email, password: 'correct horse battery staple', displayName: 'Chat Student' })
    .expect(201);
  return {
    authorization: { Authorization: `Bearer ${response.body.accessToken as string}` },
    user: response.body.user
  };
}

async function createConversation(authorization: Record<string, string>): Promise<string> {
  const response = await request(server)
    .post('/api/v1/chat/conversations')
    .set(authorization)
    .expect(201);
  return response.body.id as string;
}

function streamEvents(response: request.Response): Array<{ type: string; [key: string]: unknown }> {
  return response.text
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { type: string; [key: string]: unknown });
}

describe('chat HTTP with isolated Mongo and GridFS', () => {
  it('requires authentication and prevents another user from reading a conversation', async () => {
    await request(server).get('/api/v1/chat/conversations').expect(401);
    const stamp = Date.now();
    const owner = await register(`chat-owner-${stamp}@example.test`);
    const other = await register(`chat-other-${stamp}@example.test`);
    const conversationId = await createConversation(owner.authorization);

    await request(server)
      .get(`/api/v1/chat/conversations/${conversationId}`)
      .set(other.authorization)
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('CHAT_CONVERSATION_NOT_FOUND'));
  });

  it('stores a valid image, returns a scoped answer, and deletes the GridFS bytes with its conversation', async () => {
    const owner = await register(`chat-image-${Date.now()}@example.test`);
    const conversationId = await createConversation(owner.authorization);
    const sent = await request(server)
      .post(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set(owner.authorization)
      .field('text', 'Đọc biểu đồ tài chính trong ảnh')
      .attach('images', png, { filename: 'chart.png', contentType: 'image/png' });
    expect(sent.status, sent.text).toBe(200);
    expect(sent.headers['content-type']).toMatch(/application\/x-ndjson/);
    const events = streamEvents(sent);
    expect(events.map(({ type }) => type)).toEqual([
      'checking_scope',
      'reading_images',
      'generating',
      'final'
    ]);
    expect(events.at(-1)).toMatchObject({ type: 'final', message: { scope: 'finance' } });

    const detail = await request(server)
      .get(`/api/v1/chat/conversations/${conversationId}`)
      .set(owner.authorization)
      .expect(200);
    expect(detail.body.messages[0]).toMatchObject({
      role: 'user',
      attachments: [{ mimeType: 'image/png' }]
    });
    const connection = app.get<{
      db: { collection(name: string): { countDocuments(filter?: unknown): Promise<number> } };
    }>('DatabaseConnection');
    await expect(connection.db.collection('uploads_chat.files').countDocuments()).resolves.toBe(1);

    await request(server)
      .delete(`/api/v1/chat/conversations/${conversationId}`)
      .set(owner.authorization)
      .expect(204);
    await expect(connection.db.collection('uploads_chat.files').countDocuments()).resolves.toBe(0);
  });

  it('persists an out-of-scope refusal without calling the generation provider', async () => {
    const owner = await register(`chat-scope-${Date.now()}@example.test`);
    const conversationId = await createConversation(owner.authorization);
    const response = await request(server)
      .post(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set(owner.authorization)
      .send({ text: 'Hãy dự đoán kết quả bóng đá tối nay' })
      .expect(200);
    expect(streamEvents(response).at(-1)).toMatchObject({
      type: 'refusal',
      message: { scope: 'out_of_scope', reasonCode: 'out_of_scope' }
    });
  });

  it('rejects a fifth image with CHAT_IMAGE_INVALID before any bytes are persisted', async () => {
    const owner = await register(`chat-limit-${Date.now()}@example.test`);
    const conversationId = await createConversation(owner.authorization);
    const requestBuilder = request(server)
      .post(`/api/v1/chat/conversations/${conversationId}/messages`)
      .set(owner.authorization)
      .field('text', 'Đọc các biểu đồ này');
    for (let index = 0; index < 5; index += 1)
      requestBuilder.attach('images', png, {
        filename: `chart-${index}.png`,
        contentType: 'image/png'
      });
    await requestBuilder
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('CHAT_IMAGE_INVALID'));
    const connection = app.get<{
      db: { collection(name: string): { countDocuments(filter?: unknown): Promise<number> } };
    }>('DatabaseConnection');
    await expect(connection.db.collection('uploads_chat.files').countDocuments()).resolves.toBe(0);
  });
});
