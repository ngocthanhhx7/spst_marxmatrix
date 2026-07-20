import type { Environment } from './env.schema.js';

export function configuration(environment: Environment) {
  return {
    app: {
      port: environment.PORT,
      frontendUrl: environment.FRONTEND_URL,
      corsOrigins: environment.CORS_ORIGINS.split(',').map((origin) => origin.trim())
    },
    mongo: {
      uri: environment.MONGODB_URI,
      databaseName: environment.MONGODB_DB_NAME,
      gridFsBucketName: environment.GRIDFS_BUCKET_NAME
    },
    auth: {
      accessSecret: environment.JWT_ACCESS_SECRET,
      refreshSecret: environment.JWT_REFRESH_SECRET,
      accessTtl: environment.JWT_ACCESS_TTL,
      refreshTtl: environment.JWT_REFRESH_TTL,
      cookieName: environment.AUTH_COOKIE_NAME,
      cookieSecure: environment.COOKIE_SECURE
    },
    ai: {
      provider: environment.AI_PROVIDER,
      geminiApiKey: environment.GEMINI_API_KEY,
      generationModel: environment.GEMINI_GENERATION_MODEL,
      embeddingModel: environment.GEMINI_EMBEDDING_MODEL,
      timeoutMs: environment.AI_REQUEST_TIMEOUT_MS,
      maxRetries: environment.AI_MAX_RETRIES
    },
    rag: { vectorProvider: environment.RAG_VECTOR_PROVIDER },
    security: {
      rateLimitTtlMs: environment.RATE_LIMIT_TTL_MS,
      rateLimitMax: environment.RATE_LIMIT_MAX
    },
    observability: { logLevel: environment.LOG_LEVEL },
    demoMode: environment.DEMO_MODE
  } as const;
}
