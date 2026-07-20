/* eslint-disable @typescript-eslint/require-await */
import { describe, expect, it } from 'vitest';
import {
  JobHandlerFailure,
  JobHandlerRegistry,
  WorkerRunner,
  type JobHandler
} from './worker-runner.js';

const leasedJob = {
  _id: { toString: () => '507f1f77bcf86cd799439011' },
  type: 'parse_pdf',
  attempts: 1,
  leaseToken: 'lease-one'
};

describe('WorkerRunner', () => {
  it('runs only an allow-listed handler and completes the held lease', async () => {
    const handled: string[] = [];
    const registry = new JobHandlerRegistry();
    registry.register({
      type: 'parse_pdf',
      handle: async (job) => {
        handled.push(job._id.toString());
      }
    } satisfies JobHandler);
    const jobs = {
      claim: async () => leasedJob,
      complete: async () => undefined,
      renew: async () => undefined,
      fail: async () => undefined
    };
    const worker = new WorkerRunner(jobs as never, registry, 'worker-test');
    await expect(worker.runOnce()).resolves.toBe(true);
    expect(handled).toEqual(['507f1f77bcf86cd799439011']);
  });

  it('isolates a handler failure by recording a retryable failed lease', async () => {
    const registry = new JobHandlerRegistry();
    registry.register({
      type: 'parse_pdf',
      handle: async () => Promise.reject(new Error('bad parse'))
    } satisfies JobHandler);
    const failures: unknown[] = [];
    const jobs = {
      claim: async () => leasedJob,
      complete: async () => undefined,
      fail: async (...args: unknown[]) => {
        failures.push(args);
      },
      renew: async () => undefined
    };
    const worker = new WorkerRunner(jobs as never, registry, 'worker-test');
    await expect(worker.runOnce()).resolves.toBe(true);
    expect(failures[0]).toMatchObject([
      '507f1f77bcf86cd799439011',
      'worker-test',
      'lease-one',
      { errorCode: 'JOB_HANDLER_FAILED', retryable: true }
    ]);
  });

  it('records only an allow-listed typed handler failure', async () => {
    const registry = new JobHandlerRegistry();
    registry.register({
      type: 'parse_pdf',
      handle: async () => Promise.reject(new JobHandlerFailure('OCR_UNSUPPORTED', false))
    } satisfies JobHandler);
    const failures: unknown[] = [];
    const jobs = {
      claim: async () => leasedJob,
      complete: async () => undefined,
      renew: async () => undefined,
      fail: async (...args: unknown[]) => failures.push(args)
    };
    const worker = new WorkerRunner(jobs as never, registry, 'worker-test');
    await worker.runOnce();
    expect(failures[0]).toMatchObject([
      '507f1f77bcf86cd799439011',
      'worker-test',
      'lease-one',
      {
        errorCode: 'OCR_UNSUPPORTED',
        errorMessage: 'The PDF requires OCR support.',
        retryable: false
      }
    ]);
  });

  it('renews a long-running handler lease before it can be reclaimed', async () => {
    const registry = new JobHandlerRegistry();
    registry.register({
      type: 'parse_pdf',
      handle: async () => new Promise((resolve) => setTimeout(resolve, 25))
    } satisfies JobHandler);
    const renewals: unknown[] = [];
    const jobs = {
      claim: async () => leasedJob,
      complete: async () => undefined,
      fail: async () => undefined,
      renew: async (...args: unknown[]) => renewals.push(args)
    };
    const worker = new WorkerRunner(jobs as never, registry, 'worker-test', 5);
    await worker.runOnce();
    expect(renewals.length).toBeGreaterThan(0);
    expect(renewals[0]).toMatchObject(['507f1f77bcf86cd799439011', 'worker-test', 'lease-one']);
  });

  it('stops polling before taking another lease', async () => {
    const registry = new JobHandlerRegistry();
    const jobs = { claim: async () => leasedJob };
    const worker = new WorkerRunner(jobs as never, registry, 'worker-test');
    await worker.stop();
    await expect(worker.runOnce()).resolves.toBe(false);
  });

  it('wakes a sleeping poll immediately on graceful stop', async () => {
    const registry = new JobHandlerRegistry();
    const jobs = { claim: async () => null };
    const worker = new WorkerRunner(jobs as never, registry, 'worker-test');
    worker.start(60_000);
    await Promise.resolve();
    await expect(worker.stop()).resolves.toBeUndefined();
  });

  it('aborts an active handler on graceful stop without completing a lease after shutdown', async () => {
    const registry = new JobHandlerRegistry();
    let handlerStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      handlerStarted = resolve;
    });
    registry.register({
      type: 'parse_pdf',
      handle: async (_job, signal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener('abort', () => resolve(), { once: true });
          handlerStarted?.();
        })
    } satisfies JobHandler);
    const completed: unknown[] = [];
    const failed: unknown[] = [];
    let claimed = false;
    const jobs = {
      claim: async () => {
        if (claimed) return null;
        claimed = true;
        return leasedJob;
      },
      complete: async (...args: unknown[]) => completed.push(args),
      fail: async (...args: unknown[]) => failed.push(args),
      renew: async () => undefined
    };
    const worker = new WorkerRunner(jobs as never, registry, 'worker-test', 1);
    worker.start(50);
    await started;
    await worker.stop();
    expect(completed).toEqual([]);
    expect(failed).toEqual([]);
  });
});
