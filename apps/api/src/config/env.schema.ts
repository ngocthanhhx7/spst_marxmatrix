import { z } from 'zod';

const booleanFromString = z.enum(['true', 'false']).transform((value) => value === 'true');
const numericString = z.coerce.number().int().positive();
const duration = z
  .string()
  .regex(
    /^(?:[1-9]\d*|[1-9]\d*(?:ms|s|m|h|d|w|y))$/,
    'Duration must be a positive integer seconds value or use ms/s/m/h/d/w/y units.'
  );
const unsafeSecretTerms = ['change-me', 'local-', 'placeholder', 'example', 'replace-this'];

function isUnsafeProductionSecret(secret: string): boolean {
  const normalized = secret.toLowerCase();
  return secret.length < 32 || unsafeSecretTerms.some((term) => normalized.includes(term));
}

function isLocalMongoUri(uri: string): boolean {
  return /^mongodb(?:\+srv)?:\/\/(?:[^@/]+@)?(?:localhost|127\.0\.0\.1|::1|\[::1\])(?::|\/|$)/i.test(
    uri
  );
}

const baseEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  ALLOW_SELF_HOSTED_PRODUCTION: booleanFromString.default(false),
  PORT: numericString.default(3000),
  FRONTEND_URL: z.url(),
  CORS_ORIGINS: z.string().min(1),
  MONGODB_URI: z.string().regex(/^mongodb(\+srv)?:\/\//, 'MONGODB_URI must be a MongoDB URI.'),
  MONGODB_DB_NAME: z.string().min(1),
  GRIDFS_BUCKET_NAME: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: duration,
  JWT_REFRESH_TTL: duration,
  AUTH_COOKIE_NAME: z.string().min(1),
  COOKIE_SECURE: booleanFromString,
  AUTH_COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  JWT_REFRESH_MAX_AGE_MS: numericString.default(604800000),
  AI_PROVIDER: z.enum(['mock', 'gemini']),
  GEMINI_API_KEY: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.string().min(1).optional()
  ),
  GEMINI_GENERATION_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  GEMINI_EMBEDDING_MODEL: z.string().min(1).default('gemini-embedding-001'),
  RAG_VECTOR_PROVIDER: z.enum(['local', 'atlas']).default('local'),
  AI_REQUEST_TIMEOUT_MS: numericString,
  AI_MAX_RETRIES: z.coerce.number().int().min(0).max(10),
  DOCUMENT_MAX_SIZE_MB: numericString.max(100),
  DOCUMENT_ALLOWED_MIME_TYPES: z.string().min(1),
  RATE_LIMIT_TTL_MS: numericString,
  RATE_LIMIT_MAX: numericString.max(10000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),
  DEMO_MODE: booleanFromString
});

export const environmentSchema = baseEnvironmentSchema.superRefine((environment, context) => {
  const origins = environment.CORS_ORIGINS.split(',').map((origin) => origin.trim());
  if (origins.some((origin) => origin === '')) {
    context.addIssue({
      code: 'custom',
      path: ['CORS_ORIGINS'],
      message: 'CORS_ORIGINS must not contain empty origins.'
    });
  }
  if (environment.NODE_ENV === 'production') {
    if (environment.AUTH_COOKIE_SAME_SITE === 'none' && !environment.COOKIE_SECURE)
      context.addIssue({
        code: 'custom',
        path: ['AUTH_COOKIE_SAME_SITE'],
        message: 'SameSite=none requires COOKIE_SECURE=true.'
      });
    if (environment.DEMO_MODE)
      context.addIssue({
        code: 'custom',
        path: ['DEMO_MODE'],
        message: 'DEMO_MODE must be false in production.'
      });
    if (environment.AI_PROVIDER === 'mock')
      context.addIssue({
        code: 'custom',
        path: ['AI_PROVIDER'],
        message: 'AI_PROVIDER must not be mock in production.'
      });
    if (!environment.ALLOW_SELF_HOSTED_PRODUCTION && environment.RAG_VECTOR_PROVIDER !== 'atlas')
      context.addIssue({
        code: 'custom',
        path: ['RAG_VECTOR_PROVIDER'],
        message: 'RAG_VECTOR_PROVIDER must be atlas in production.'
      });
    if (!environment.ALLOW_SELF_HOSTED_PRODUCTION && isLocalMongoUri(environment.MONGODB_URI))
      context.addIssue({
        code: 'custom',
        path: ['MONGODB_URI'],
        message: 'MONGODB_URI must not target localhost in production.'
      });
    if (isUnsafeProductionSecret(environment.JWT_ACCESS_SECRET))
      context.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_SECRET'],
        message: 'JWT_ACCESS_SECRET is unsafe for production.'
      });
    if (isUnsafeProductionSecret(environment.JWT_REFRESH_SECRET))
      context.addIssue({
        code: 'custom',
        path: ['JWT_REFRESH_SECRET'],
        message: 'JWT_REFRESH_SECRET is unsafe for production.'
      });
    if (origins.includes('*'))
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'CORS_ORIGINS must not include wildcard origins in production.'
      });
    if (!environment.COOKIE_SECURE)
      context.addIssue({
        code: 'custom',
        path: ['COOKIE_SECURE'],
        message: 'COOKIE_SECURE must be true in production.'
      });
    if (environment.AI_PROVIDER === 'gemini' && !environment.GEMINI_API_KEY)
      context.addIssue({
        code: 'custom',
        path: ['GEMINI_API_KEY'],
        message: 'GEMINI_API_KEY is required for Gemini in production.'
      });
  }
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(input: Record<string, string | undefined>): Environment {
  return environmentSchema.parse(input);
}
