import { describe, expect, it } from 'vitest';
import { JobHandlerFailure } from '../jobs/worker-runner.js';
import { ExtractFinancialsHandler } from './extract-financials.handler.js';

describe('ExtractFinancialsHandler', () => {
  it('registers once and dispatches the allow-listed document and analysis ids', async () => {
    const calls: string[][] = [];
    const registry = { register: (handler: unknown) => registered.push(handler) };
    const registered: unknown[] = [];
    const handler = new ExtractFinancialsHandler(
      {
        extract: (documentId: string, analysisId: string) =>
          Promise.resolve(calls.push([documentId, analysisId]))
      } as never,
      registry as never
    );
    handler.onModuleInit();
    handler.onModuleInit();
    await handler.handle(
      {
        payload: {
          documentId: { toString: () => '507f1f77bcf86cd799439011' },
          analysisId: { toString: () => '507f1f77bcf86cd799439012' }
        }
      } as never,
      new AbortController().signal
    );
    expect(registered).toEqual([handler]);
    expect(calls).toEqual([['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']]);
  });

  it('maps public extraction failures to a safe queue error', async () => {
    const handler = new ExtractFinancialsHandler(
      {
        extract: () =>
          Promise.reject(
            Object.assign(new Error('provider detail'), { code: 'AI_RESPONSE_INVALID' })
          )
      } as never,
      { register: () => undefined } as never
    );
    const failure = await handler
      .handle(
        {
          payload: {
            documentId: { toString: () => '507f1f77bcf86cd799439011' },
            analysisId: { toString: () => '507f1f77bcf86cd799439012' }
          }
        } as never,
        new AbortController().signal
      )
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(JobHandlerFailure);
    expect(failure).toMatchObject({ errorCode: 'FINANCIAL_EXTRACTION_FAILED', retryable: false });
    expect((failure as Error).message).not.toContain('provider detail');
  });
});
