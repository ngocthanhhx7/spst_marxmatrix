import { RequestMethod } from '@nestjs/common';
import type { Params } from 'nestjs-pino';

export const loggerRedaction = {
  paths: [
    'req.headers.authorization',
    'req.headers.x-api-key',
    'req.headers.cookie',
    'req.body.password',
    'req.body.accessToken',
    'req.body.refreshToken',
    'req.body.apiKey',
    '*.password',
    '*.accessToken',
    '*.refreshToken',
    '*.apiKey',
    'authorization',
    'cookie',
    'password',
    'accessToken',
    'refreshToken',
    'apiKey',
    'GEMINI_API_KEY',
    'geminiApiKey',
    'gemini_api_key'
  ] as string[],
  censor: '[REDACTED]'
};

export const loggerOptions: Params = {
  forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
  pinoHttp: {
    level: 'info',
    redact: loggerRedaction,
    customProps: (request) => ({ requestId: request.id })
  }
};

export function createLoggerOptions(logLevel: string): Params {
  return { ...loggerOptions, pinoHttp: { ...loggerOptions.pinoHttp, level: logLevel } };
}
