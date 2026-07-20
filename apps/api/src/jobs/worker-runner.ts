import { Inject, Injectable, Optional } from '@nestjs/common';
import { jobTypeSchema, type JobType } from '@marxmatrix/contracts';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { JobService, type LeasedJobDocument } from './jobs.service.js';

export const PARSE_PDF_JOB_HANDLER = Symbol('PARSE_PDF_JOB_HANDLER');
export const WORKER_ID = Symbol('WORKER_ID');
export const WORKER_HEARTBEAT_MS = Symbol('WORKER_HEARTBEAT_MS');

const HANDLER_FAILURES = {
  OCR_UNSUPPORTED: { errorMessage: 'The PDF requires OCR support.', retryable: false },
  INVALID_PDF: { errorMessage: 'The document is not a valid PDF.', retryable: false },
  PDF_PARSE_FAILED: { errorMessage: 'The PDF could not be parsed.', retryable: true },
  FINANCIAL_EXTRACTION_FAILED: {
    errorMessage: 'Financial extraction could not be completed.',
    retryable: true
  },
  EMBEDDING_FAILED: { errorMessage: 'Document indexing could not be completed.', retryable: true }
} as const;

export type JobHandlerFailureCode = keyof typeof HANDLER_FAILURES;

/** A handler may disclose only this small, non-sensitive failure vocabulary to the queue. */
export class JobHandlerFailure extends Error {
  readonly errorCode: JobHandlerFailureCode;
  readonly errorMessage: string;
  readonly retryable: boolean;

  constructor(errorCode: JobHandlerFailureCode, retryable?: boolean) {
    const definition = HANDLER_FAILURES[errorCode];
    super(definition.errorMessage);
    this.name = 'JobHandlerFailure';
    this.errorCode = errorCode;
    this.errorMessage = definition.errorMessage;
    this.retryable = retryable ?? definition.retryable;
  }
}

/** Unique for each process start; PID alone can be reused after a restart. */
export function createWorkerInstanceId(): string {
  return `worker-${hostname().slice(0, 100)}-${process.pid}-${randomUUID()}`;
}

/** Integration seam for the document subsystem; it owns parsing implementation. */
export interface ParsePdfJobHandler {
  parsePdf(documentId: string, signal: AbortSignal): Promise<void>;
}

export interface JobHandler {
  readonly type: JobType;
  handle(job: LeasedJobDocument, signal: AbortSignal): Promise<void>;
}

@Injectable()
export class JobHandlerRegistry {
  private readonly handlers = new Map<JobType, JobHandler>();

  register(handler: JobHandler): void {
    const parsed = jobTypeSchema.safeParse(handler.type);
    if (!parsed.success) throw new RangeError('A handler must use an allow-listed job type.');
    if (this.handlers.has(parsed.data))
      throw new RangeError(`A handler is already registered for ${parsed.data}.`);
    this.handlers.set(parsed.data, handler);
  }

  get(type: JobType): JobHandler | undefined {
    return this.handlers.get(type);
  }
}

@Injectable()
export class WorkerRunner {
  private abortController = new AbortController();
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private wakeSleepingPoll: (() => void) | undefined;
  private polling: Promise<void> | undefined;

  private readonly workerId: string;
  private readonly heartbeatMs: number;

  public constructor(
    private readonly jobs: JobService,
    private readonly handlers: JobHandlerRegistry,
    @Optional() @Inject(WORKER_ID) workerId?: string,
    @Optional() @Inject(WORKER_HEARTBEAT_MS) heartbeatMs?: number
  ) {
    const interval = heartbeatMs ?? 10_000;
    if (!Number.isInteger(interval) || interval < 1 || interval > 60_000)
      throw new RangeError('heartbeatMs must be an integer between 1 and 60000.');
    this.heartbeatMs = interval;
    this.workerId = workerId ?? createWorkerInstanceId();
  }

  /** Executes at most one job; all per-job failures are isolated into queue state. */
  async runOnce(): Promise<boolean> {
    if (this.stopped || this.abortController.signal.aborted) return false;
    const job = await this.jobs.claim(this.workerId);
    if (job === null || this.stopped || this.abortController.signal.aborted) return job !== null;
    const handler = this.handlers.get(job.type);
    if (handler === undefined) {
      await this.recordFailure(
        job,
        'UNSUPPORTED_JOB_HANDLER',
        'No allow-listed handler is registered.',
        false
      );
      return true;
    }
    const jobAbortController = new AbortController();
    const abortJob = () => jobAbortController.abort();
    this.abortController.signal.addEventListener('abort', abortJob, { once: true });
    const stopHeartbeat = this.startHeartbeat(job, jobAbortController);
    try {
      await handler.handle(job, jobAbortController.signal);
      await stopHeartbeat();
      if (!jobAbortController.signal.aborted)
        await this.jobs.complete(job._id.toString(), this.workerId, job.leaseToken);
    } catch (error: unknown) {
      await stopHeartbeat();
      if (!jobAbortController.signal.aborted) {
        const failure = this.handlerFailure(error);
        await this.recordFailure(job, failure.errorCode, failure.errorMessage, failure.retryable);
      }
    } finally {
      this.abortController.signal.removeEventListener('abort', abortJob);
    }
    return true;
  }

  start(pollMs = 1_000): void {
    if (!Number.isInteger(pollMs) || pollMs < 50 || pollMs > 60_000)
      throw new RangeError('pollMs must be an integer between 50 and 60000.');
    if (this.polling !== undefined || this.stopped) return;
    this.polling = this.poll(pollMs).finally(() => {
      this.polling = undefined;
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.abortController.abort();
    this.wakeSleepingPoll?.();
    await this.polling;
  }

  private async poll(pollMs: number): Promise<void> {
    while (!this.stopped && !this.abortController.signal.aborted) {
      try {
        await this.runOnce();
      } catch {
        // Claim/database outages are isolated; the next bounded poll may recover.
      }
      if (this.stopped || this.abortController.signal.aborted) return;
      await new Promise<void>((resolve) => {
        const wake = () => {
          if (this.timer !== undefined) clearTimeout(this.timer);
          this.timer = undefined;
          this.wakeSleepingPoll = undefined;
          resolve();
        };
        this.wakeSleepingPoll = wake;
        this.timer = setTimeout(wake, pollMs);
      });
    }
  }

  private async recordFailure(
    job: LeasedJobDocument,
    errorCode: string,
    errorMessage: string,
    retryable: boolean
  ): Promise<void> {
    try {
      await this.jobs.fail(job._id.toString(), this.workerId, job.leaseToken, {
        errorCode,
        errorMessage,
        retryable
      });
    } catch {
      // A reclaimed/expired lease must not crash the worker loop.
    }
  }

  private startHeartbeat(
    job: LeasedJobDocument,
    jobAbortController: AbortController
  ): () => Promise<void> {
    let renewal: Promise<void> | undefined;
    const renew = () => {
      if (this.stopped || jobAbortController.signal.aborted || renewal !== undefined) return;
      renewal = this.jobs
        .renew(job._id.toString(), this.workerId, job.leaseToken)
        .then(() => undefined)
        .catch(() => {
          // The lease may have been reclaimed; ask cooperative handlers to stop safely.
          jobAbortController.abort();
        })
        .finally(() => {
          renewal = undefined;
        });
    };
    const timer = setInterval(renew, this.heartbeatMs);
    return async () => {
      clearInterval(timer);
      await renewal;
    };
  }

  private handlerFailure(error: unknown): {
    errorCode: string;
    errorMessage: string;
    retryable: boolean;
  } {
    if (error instanceof JobHandlerFailure) return error;
    return {
      errorCode: 'JOB_HANDLER_FAILED',
      errorMessage: 'The job handler failed.',
      retryable: true
    };
  }
}
