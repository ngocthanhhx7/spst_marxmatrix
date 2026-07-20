import { describe, expect, it } from 'vitest';
import { parseEnvironment } from './env.schema.js';

const validEnvironment = {
  NODE_ENV: 'development',
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

describe('environmentSchema', () => {
  it('defaults new deployments to the supported Gemini Embedding 2 model', () => {
    expect(parseEnvironment(validEnvironment).GEMINI_EMBEDDING_MODEL).toBe('gemini-embedding-2');
  });
});
