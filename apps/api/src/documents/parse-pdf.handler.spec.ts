/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest';
import { JobHandlerFailure } from '../jobs/worker-runner.js';
import { ParsePdfHandler } from './parse-pdf.handler.js';
import { PdfParsingError } from './pdf-parser.service.js';

describe('ParsePdfHandler', () => {
  it('registers exactly one allow-listed parse handler and dispatches the document id', async () => {
    const registered: unknown[] = [];
    const parsed: string[] = [];
    const handler = new ParsePdfHandler(
      { parseDocument: async (id: string) => parsed.push(id) } as never,
      {} as never,
      { register: (value: unknown) => registered.push(value) } as never
    );
    handler.onModuleInit();
    handler.onModuleInit();
    await handler.handle(
      { payload: { documentId: { toString: () => '507f1f77bcf86cd799439011' } } } as never,
      new AbortController().signal
    );
    expect(registered).toEqual([handler]);
    expect(parsed).toEqual(['507f1f77bcf86cd799439011']);
  });

  it('does not parse when shutdown has aborted the worker signal', async () => {
    const controller = new AbortController();
    controller.abort();
    const handler = new ParsePdfHandler(
      {
        parseDocument: async () => {
          throw new Error('must not run');
        }
      } as never,
      {} as never,
      { register: () => undefined } as never
    );
    await expect(
      handler.handle(
        { payload: { documentId: { toString: () => '507f1f77bcf86cd799439011' } } } as never,
        controller.signal
      )
    ).rejects.toThrow('aborted');
  });

  it('fails retryably when another worker still holds the document parse lease', async () => {
    const handler = new ParsePdfHandler(
      { parseDocument: async () => 'busy' } as never,
      {} as never,
      { register: () => undefined } as never
    );
    await expect(
      handler.handle(
        { payload: { documentId: { toString: () => '507f1f77bcf86cd799439011' } } } as never,
        new AbortController().signal
      )
    ).rejects.toThrow('Document parsing is currently busy.');
  });

  it('maps OCR_UNSUPPORTED to a safe nonretryable queue failure', async () => {
    const handler = new ParsePdfHandler(
      {
        parseDocument: async () => {
          throw new PdfParsingError('OCR_UNSUPPORTED', 'sensitive parser detail');
        }
      } as never,
      {} as never,
      { register: () => undefined } as never
    );

    const failure = await handler
      .handle(
        {
          payload: { documentId: { toString: () => '507f1f77bcf86cd799439011' } }
        } as never,
        new AbortController().signal
      )
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(JobHandlerFailure);
    expect(failure).toMatchObject({
      errorCode: 'OCR_UNSUPPORTED',
      errorMessage: 'The PDF requires OCR support.',
      retryable: false
    });
    expect((failure as Error).message).not.toContain('sensitive parser detail');
  });
});
