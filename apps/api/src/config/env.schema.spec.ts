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
  DEMO_MODE: 'true',
  CHAT_ENABLED: 'false',
  GEMINI_CHAT_MODEL: '',
  CHAT_AI_TIMEOUT_MS: '60000',
  CHAT_AI_MAX_RETRIES: '2',
  CHAT_MAX_CONTEXT_MESSAGES: '20',
  CHAT_MAX_CONTEXT_BYTES: '100000',
  CHAT_MAX_RUN_AGE_MS: '180000',
  CHAT_RATE_LIMIT_PER_MINUTE: '10'
};

describe('environmentSchema', () => {
  it('defaults new deployments to the supported Gemini Embedding 2 model', () => {
    expect(parseEnvironment(validEnvironment).GEMINI_EMBEDDING_MODEL).toBe('gemini-embedding-2');
  });

  it('requires a Gemini chat model when chat is enabled', () => {
    expect(() => parseEnvironment({ ...validEnvironment, CHAT_ENABLED: 'true' })).toThrow(
      'GEMINI_CHAT_MODEL is required when CHAT_ENABLED=true.'
    );
    expect(
      parseEnvironment({
        ...validEnvironment,
        CHAT_ENABLED: 'true',
        GEMINI_CHAT_MODEL: 'gemini-test'
      }).GEMINI_CHAT_MODEL
    ).toBe('gemini-test');
  });

  it('rejects a zero chat rate limit', () => {
    expect(() => parseEnvironment({ ...validEnvironment, CHAT_RATE_LIMIT_PER_MINUTE: '0' })).toThrow();
  });

  it('rejects chat context message limits over 100', () => {
    expect(() => parseEnvironment({ ...validEnvironment, CHAT_MAX_CONTEXT_MESSAGES: '101' })).toThrow();
  });
});
