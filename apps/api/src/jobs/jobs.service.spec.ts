/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/only-throw-error, @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest';
import { JobService } from './jobs.service.js';

describe('JobService', () => {
  it('atomically requeues a terminal failed job with a fresh retry budget', async () => {
    const calls: unknown[] = [];
    const jobs = {
      findOneAndUpdate: async (...args: unknown[]) => {
        calls.push(args);
        return { _id: '507f1f77bcf86cd799439011', status: 'queued', attempts: 0 };
      }
    };
    const service = new JobService(jobs as never);

    await expect(service.requeueFailed('507f1f77bcf86cd799439011')).resolves.toMatchObject({
      status: 'queued',
      attempts: 0
    });
    const [filter, update] = calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(filter).toMatchObject({ _id: expect.anything(), status: 'failed' });
    expect(update).toMatchObject({
      $set: {
        status: 'queued',
        attempts: 0,
        errorCode: null,
        errorMessage: null,
        lockedBy: null,
        lockedUntil: null,
        leaseToken: null,
        runAt: expect.any(Date)
      }
    });
  });

  it('claims a queued job exactly once through an atomic lease update', async () => {
    const calls: unknown[] = [];
    const jobs = {
      updateMany: async () => undefined,
      findOneAndUpdate: async (...args: unknown[]) => {
        calls.push(args);
        return calls.length === 1
          ? {
              _id: { toString: () => '507f1f77bcf86cd799439011' },
              type: 'parse_pdf',
              status: 'leased',
              payload: { documentId: '507f1f77bcf86cd799439012', analysisId: null },
              attempts: 1,
              maxAttempts: 3
            }
          : null;
      }
    };
    const service = new JobService(jobs as never);
    await expect(
      service.claim('worker-a', new Date('2026-01-01T00:00:00.000Z'))
    ).resolves.toMatchObject({
      type: 'parse_pdf',
      attempts: 1
    });
    await expect(
      service.claim('worker-b', new Date('2026-01-01T00:00:00.000Z'))
    ).resolves.toBeNull();
    expect(calls).toHaveLength(2);
    const [filter] = calls[0] as [Record<string, unknown>];
    expect(filter['$expr']).toEqual({ $lt: ['$attempts', '$maxAttempts'] });
  });

  it('terminally reconciles an expired lease whose persisted retry budget is exhausted before claiming', async () => {
    const reconciliations: unknown[] = [];
    const jobs = {
      updateMany: async (...args: unknown[]) => {
        reconciliations.push(args);
      },
      findOneAndUpdate: async () => null
    };
    const service = new JobService(jobs as never);
    await service.claim('worker-a', new Date('2026-01-01T00:00:00.000Z'));
    expect(reconciliations[0]).toMatchObject([
      {
        status: 'leased',
        lockedUntil: { $lte: expect.any(Date) },
        $expr: { $gte: ['$attempts', '$maxAttempts'] }
      },
      { $set: { status: 'failed', errorCode: 'JOB_ATTEMPTS_EXHAUSTED' } }
    ]);
  });

  it('requires an unexpired lease before completion', async () => {
    const filters: unknown[] = [];
    const jobs = {
      updateMany: async () => undefined,
      findOneAndUpdate: async (...args: unknown[]) => {
        filters.push(args[0]);
        return null;
      }
    };
    const service = new JobService(jobs as never);
    await expect(
      service.complete('507f1f77bcf86cd799439011', 'worker-a', 'lease-a', new Date())
    ).rejects.toMatchObject({
      code: 'JOB_LOCK_CONFLICT'
    });
    expect(filters[0]).toMatchObject({
      lockedUntil: { $gt: expect.any(Date) },
      leaseToken: 'lease-a'
    });
  });

  it('derives terminal and retry state from persisted attempts in one atomic update', async () => {
    const updates: unknown[] = [];
    const jobs = {
      findOneAndUpdate: async (...args: unknown[]) => {
        updates.push(args);
        return { _id: 'job', status: 'queued' };
      }
    };
    const service = new JobService(jobs as never);
    const jobId = '507f1f77bcf86cd799439011';
    await expect(
      service.fail(jobId, 'worker-a', 'lease-a', {
        errorCode: 'PARSE_FAILED',
        errorMessage: 'bad PDF'
      })
    ).resolves.toMatchObject({
      status: 'queued'
    });
    const [filter, update] = updates[0] as [
      Record<string, unknown>,
      Array<Record<string, unknown>>
    ];
    expect(filter).toMatchObject({ lockedUntil: { $gt: expect.any(Date) }, leaseToken: 'lease-a' });
    expect(update[0]?.['$set']).toMatchObject({
      status: expect.objectContaining({ $cond: expect.any(Array) })
    });
  });

  it('fences renewal with the unique lease token and extends only the held lease', async () => {
    const calls: unknown[] = [];
    const jobs = {
      findOneAndUpdate: async (...args: unknown[]) => {
        calls.push(args);
        return null;
      }
    };
    const service = new JobService(jobs as never);
    await expect(
      service.renew(
        '507f1f77bcf86cd799439011',
        'worker-a',
        'lease-attempt-one',
        new Date('2026-01-01T00:00:10.000Z')
      )
    ).rejects.toMatchObject({ code: 'JOB_LOCK_CONFLICT' });
    const [filter, update] = calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(filter).toMatchObject({
      status: 'leased',
      lockedBy: 'worker-a',
      leaseToken: 'lease-attempt-one',
      lockedUntil: { $gt: expect.any(Date) }
    });
    expect(update).toMatchObject({ $set: { lockedUntil: expect.any(Date) } });
  });

  it('returns the existing job only when a globally unique idempotency key has the same canonical request', async () => {
    const existing = {
      payload: { documentId: { toString: () => '507f1f77bcf86cd799439011' }, analysisId: null },
      type: 'parse_pdf',
      maxAttempts: 3,
      requestedRunAt: null
    };
    const jobs = {
      create: async () => {
        throw { code: 11000 };
      },
      findOne: async () => existing
    };
    const service = new JobService(jobs as never);
    await expect(
      service.enqueue({
        type: 'parse_pdf',
        payload: { documentId: '507f1f77bcf86cd799439011' },
        idempotencyKey: 'request-1'
      })
    ).resolves.toBe(existing);
    await expect(
      service.enqueue({
        type: 'embed_document',
        payload: { documentId: '507f1f77bcf86cd799439011' },
        idempotencyKey: 'request-1'
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT', statusCode: 409 });
  });

  it('conflicts when a reused key changes retry or explicit schedule policy', async () => {
    const existing = {
      payload: { documentId: { toString: () => '507f1f77bcf86cd799439011' }, analysisId: null },
      type: 'parse_pdf',
      maxAttempts: 3,
      requestedRunAt: null
    };
    const jobs = {
      create: async () => {
        throw { code: 11000 };
      },
      findOne: async () => existing
    };
    const service = new JobService(jobs as never);
    await expect(
      service.enqueue({
        type: 'parse_pdf',
        payload: { documentId: '507f1f77bcf86cd799439011' },
        idempotencyKey: 'request-2',
        maxAttempts: 4
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT' });
  });
});
