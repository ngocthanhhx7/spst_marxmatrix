import { MongooseModule, getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import type { Model } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JobsModule } from '../../src/jobs/jobs.module.js';
import { JobService } from '../../src/jobs/jobs.service.js';
import { Job } from '../../src/jobs/schemas/job.schema.js';

const dbName = `marxmatrix_jobs_${process.pid}_${Date.now()}`;
const documentId = '507f1f77bcf86cd799439011';
let jobs: JobService;
let model: Model<Job>;
let close: () => Promise<void>;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [MongooseModule.forRoot('mongodb://127.0.0.1:27017', { dbName }), JobsModule]
  }).compile();
  jobs = moduleRef.get(JobService);
  model = moduleRef.get<Model<Job>>(getModelToken(Job.name));
  await model.syncIndexes();
  close = () => moduleRef.close();
}, 30_000);

afterAll(async () => {
  await model.db.dropDatabase();
  await close();
});

beforeEach(async () => {
  await model.db.dropDatabase();
  await model.syncIndexes();
});

describe('Mongo job queue', () => {
  it('has the persisted indexes used by global idempotency and lease lookup', async () => {
    const names = (await model.collection.indexes()).map((index) => index.name);
    expect(names).toContain('job_idempotency_key_unique');
    expect(names).toContain('job_expired_lease_lookup');
  });

  it('persists job payload identifiers as ObjectId schema paths', () => {
    const payloadPath = (
      model.schema.path as unknown as (name: string) => {
        schema?: { paths: Record<string, { instance?: string }> };
      }
    )('payload');
    expect(payloadPath.schema?.paths['documentId']?.instance).toBe('ObjectId');
    expect(payloadPath.schema?.paths['analysisId']?.instance).toBe('ObjectId');
  });

  it('allows one atomic claim winner and reclaims a lease after expiry', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const job = await jobs.enqueue({
      type: 'parse_pdf',
      payload: { documentId },
      idempotencyKey: 'claim-race',
      runAt: now
    });
    const claimed = await Promise.all([jobs.claim('worker-a', now), jobs.claim('worker-b', now)]);
    expect(claimed.filter((value) => value !== null)).toHaveLength(1);
    const reclaimed = await jobs.claim('worker-c', new Date(now.getTime() + 30_001));
    expect(reclaimed?._id.toString()).toBe(job._id.toString());
    expect(reclaimed?.attempts).toBe(2);
  });

  it('rejects stale completion and preserves a single canonical idempotent request', async () => {
    const now = new Date('2026-02-01T00:00:00.000Z');
    const request = {
      type: 'parse_pdf' as const,
      payload: { documentId },
      idempotencyKey: 'same-key',
      runAt: now
    };
    const first = await jobs.enqueue(request);
    const same = await jobs.enqueue(request);
    expect(same._id.toString()).toBe(first._id.toString());
    await expect(
      jobs.enqueue({ type: 'embed_document', payload: { documentId }, idempotencyKey: 'same-key' })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT', statusCode: 409 });
    await expect(
      jobs.enqueue({
        ...request,
        maxAttempts: 4,
        runAt: new Date(now.getTime() + 1_000)
      })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_CONFLICT', statusCode: 409 });
    const leased = await jobs.claim('worker-a', now);
    await expect(
      jobs.complete(
        leased!._id.toString(),
        'worker-a',
        leased!.leaseToken,
        new Date('2026-02-01T00:00:30.001Z')
      )
    ).rejects.toMatchObject({ code: 'JOB_LOCK_CONFLICT' });
  });

  it('sweeps an expired final-attempt lease into a terminal job before another claim', async () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const job = await jobs.enqueue({
      type: 'parse_pdf',
      payload: { documentId },
      idempotencyKey: 'exhausted-lease',
      maxAttempts: 1,
      runAt: now
    });
    await expect(jobs.claim('worker-a', now)).resolves.not.toBeNull();
    await jobs.claim('worker-b', new Date(now.getTime() + 30_001));
    const swept = await model.findById(job._id).lean();
    expect(swept).toMatchObject({
      status: 'failed',
      attempts: 1,
      lockedBy: null,
      lockedUntil: null,
      errorCode: 'JOB_ATTEMPTS_EXHAUSTED'
    });
  });

  it('uses persisted attempts for retry terminal state and makes nonretryable errors terminal', async () => {
    const now = new Date('2026-04-01T00:00:00.000Z');
    await jobs.enqueue({
      type: 'parse_pdf',
      payload: { documentId },
      idempotencyKey: 'retry-state',
      maxAttempts: 2,
      runAt: now
    });
    const firstLease = await jobs.claim('worker-a', now);
    const requeued = await jobs.fail(
      firstLease!._id.toString(),
      'worker-a',
      firstLease!.leaseToken,
      {
        errorCode: 'PARSE_FAILED',
        errorMessage: 'parse failed'
      },
      now
    );
    expect(requeued.status).toBe('queued');
    const finalLease = await jobs.claim('worker-a', new Date(now.getTime() + 1_001));
    const terminal = await jobs.fail(
      finalLease!._id.toString(),
      'worker-a',
      finalLease!.leaseToken,
      {
        errorCode: 'PARSE_FAILED',
        errorMessage: 'parse failed'
      },
      new Date(now.getTime() + 1_001)
    );
    expect(terminal.status).toBe('failed');
    expect(terminal.attempts).toBe(2);

    const immediate = await jobs.enqueue({
      type: 'parse_pdf',
      payload: { documentId },
      idempotencyKey: 'nonretryable',
      maxAttempts: 3,
      runAt: now
    });
    const immediateLease = await jobs.claim('worker-b', now);
    const nonretryable = await jobs.fail(
      immediateLease!._id.toString(),
      'worker-b',
      immediateLease!.leaseToken,
      {
        errorCode: 'INVALID_PDF',
        errorMessage: 'not a PDF',
        retryable: false
      },
      now
    );
    expect(nonretryable).toMatchObject({ _id: immediate._id, status: 'failed', attempts: 1 });
  });

  it('fences a reclaimed lease even when both attempts use the same worker id', async () => {
    const now = new Date('2026-05-01T00:00:00.000Z');
    const job = await jobs.enqueue({
      type: 'parse_pdf',
      payload: { documentId },
      idempotencyKey: 'same-worker-fencing',
      runAt: now,
      maxAttempts: 3
    });
    const first = await jobs.claim('worker-reused', now);
    const second = await jobs.claim('worker-reused', new Date(now.getTime() + 30_001));
    expect(second?.leaseToken).not.toBe(first?.leaseToken);
    const staleNow = new Date(now.getTime() + 30_002);
    await expect(
      jobs.renew(job._id.toString(), 'worker-reused', first!.leaseToken, staleNow)
    ).rejects.toMatchObject({
      code: 'JOB_LOCK_CONFLICT'
    });
    await expect(
      jobs.complete(job._id.toString(), 'worker-reused', first!.leaseToken, staleNow)
    ).rejects.toMatchObject({
      code: 'JOB_LOCK_CONFLICT'
    });
    await expect(
      jobs.fail(
        job._id.toString(),
        'worker-reused',
        first!.leaseToken,
        {
          errorCode: 'PARSE_FAILED',
          errorMessage: 'stale attempt'
        },
        staleNow
      )
    ).rejects.toMatchObject({ code: 'JOB_LOCK_CONFLICT' });
    await expect(
      jobs.renew(job._id.toString(), 'worker-reused', second!.leaseToken, staleNow)
    ).resolves.toMatchObject({ leaseToken: second!.leaseToken });
  });

  it('keeps a healthy long-running lease claimable only by its heartbeat owner', async () => {
    const now = new Date('2026-06-01T00:00:00.000Z');
    const job = await jobs.enqueue({
      type: 'parse_pdf',
      payload: { documentId },
      idempotencyKey: 'heartbeat-prevents-reclaim',
      runAt: now
    });
    const lease = await jobs.claim('worker-a', now, 1_000);
    await jobs.renew(
      job._id.toString(),
      'worker-a',
      lease!.leaseToken,
      new Date(now.getTime() + 900),
      1_000
    );
    await expect(
      jobs.claim('worker-b', new Date(now.getTime() + 1_001), 1_000)
    ).resolves.toBeNull();
  });
});
