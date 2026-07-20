import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import {
  documentOnlyJobPayloadSchema,
  financialExtractionPayloadSchema,
  jobTypeSchema,
  type JobPayloadInput,
  type JobType
} from '@marxmatrix/contracts';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'node:crypto';
import { DomainError } from '../common/domain-error.js';
import { Job, type JobDocument } from './schemas/job.schema.js';

const MIN_LEASE_MS = 1_000;
const MAX_LEASE_MS = 300_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const MAX_BACKOFF_MS = 60_000;

export interface EnqueueJobInput {
  type: JobType;
  payload: JobPayloadInput;
  idempotencyKey: string;
  maxAttempts?: number;
  runAt?: Date;
}

export interface JobFailure {
  errorCode: string;
  errorMessage: string;
  /** Non-retryable failures become terminal immediately. */
  retryable?: boolean;
}

export type LeasedJobDocument = JobDocument & {
  status: 'leased';
  lockedBy: string;
  lockedUntil: Date;
  leaseToken: string;
};

/**
 * A Mongo-backed at-least-once queue. Lease ownership is always checked in the
 * same write that changes status, so stale workers cannot complete/requeue work.
 */
@Injectable()
export class JobService {
  public constructor(@InjectModel(Job.name) private readonly jobs: Model<Job>) {}

  async enqueue(input: EnqueueJobInput): Promise<JobDocument> {
    const type = jobTypeSchema.parse(input.type);
    const parsedPayload =
      type === 'extract_financials'
        ? financialExtractionPayloadSchema.parse(input.payload)
        : documentOnlyJobPayloadSchema.parse(input.payload);
    const documentId = parsedPayload.documentId;
    const analysisId =
      type === 'extract_financials'
        ? financialExtractionPayloadSchema.parse(input.payload).analysisId
        : null;
    const idempotencyKey = this.idempotencyKey(input.idempotencyKey);
    const maxAttempts = this.maxAttempts(input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    const requestedRunAt = input.runAt === undefined ? null : this.date(input.runAt, 'runAt');
    const runAt = requestedRunAt ?? new Date();
    try {
      return await this.jobs.create({
        type,
        payload: {
          documentId: new Types.ObjectId(documentId),
          analysisId: analysisId === null ? null : new Types.ObjectId(analysisId)
        },
        idempotencyKey,
        attempts: 0,
        maxAttempts,
        requestedRunAt,
        status: 'queued',
        runAt,
        lockedBy: null,
        lockedUntil: null,
        errorCode: null,
        errorMessage: null
      });
    } catch (error: unknown) {
      if (!this.isDuplicate(error)) throw error;
      const existing = await this.jobs.findOne({ idempotencyKey });
      if (existing === null) throw error;
      if (
        existing.type !== type ||
        existing.payload.documentId.toString() !== documentId ||
        (existing.payload.analysisId?.toString() ?? null) !== analysisId ||
        existing.maxAttempts !== maxAttempts ||
        !this.sameOptionalDate(existing.requestedRunAt, requestedRunAt)
      ) {
        throw new DomainError(
          'IDEMPOTENCY_KEY_CONFLICT',
          'Idempotency-Key was already used for a different job.',
          409
        );
      }
      return existing;
    }
  }

  async claim(
    workerId: string,
    now = new Date(),
    leaseMs = 30_000
  ): Promise<LeasedJobDocument | null> {
    const worker = this.workerId(workerId);
    const current = this.date(now, 'now');
    const leaseDuration = this.leaseMs(leaseMs);
    const lockedUntil = new Date(current.getTime() + leaseDuration);
    const leaseToken = randomUUID();
    await this.reconcileExhaustedLeases(current);
    const claimed = await this.jobs.findOneAndUpdate(
      {
        $expr: { $lt: ['$attempts', '$maxAttempts'] },
        $or: [
          { status: 'queued', runAt: { $lte: current } },
          { status: 'leased', lockedUntil: { $lte: current } }
        ]
      },
      {
        $set: { status: 'leased', lockedBy: worker, lockedUntil, leaseToken },
        $inc: { attempts: 1 }
      },
      { sort: { runAt: 1, createdAt: 1 }, returnDocument: 'after' }
    );
    return claimed as LeasedJobDocument | null;
  }

  /** Explicit retry action; concurrent callers converge on the same queued job. */
  async requeueFailed(id: string, now = new Date()): Promise<JobDocument> {
    const objectId = this.objectId(id);
    const current = this.date(now, 'now');
    const requeued = await this.jobs.findOneAndUpdate(
      { _id: objectId, status: 'failed' },
      {
        $set: {
          status: 'queued',
          attempts: 0,
          runAt: current,
          lockedBy: null,
          lockedUntil: null,
          leaseToken: null,
          errorCode: null,
          errorMessage: null
        }
      },
      { returnDocument: 'after' }
    );
    if (requeued !== null) return requeued;
    const existing = await this.jobs.findById(objectId);
    if (existing === null) throw new DomainError('JOB_NOT_FOUND', 'Job was not found.', 404);
    return existing;
  }

  async renew(
    id: string,
    workerId: string,
    leaseToken: string,
    now = new Date(),
    leaseMs = 30_000
  ): Promise<JobDocument> {
    const current = this.date(now, 'now');
    const renewed = await this.jobs.findOneAndUpdate(
      this.activeLeaseFilter(id, workerId, leaseToken, current),
      { $set: { lockedUntil: new Date(current.getTime() + this.leaseMs(leaseMs)) } },
      { returnDocument: 'after' }
    );
    if (renewed === null) throw this.lockConflict();
    return renewed;
  }

  async complete(
    id: string,
    workerId: string,
    leaseToken: string,
    now = new Date()
  ): Promise<JobDocument> {
    const completed = await this.jobs.findOneAndUpdate(
      this.activeLeaseFilter(id, workerId, leaseToken, now),
      {
        $set: {
          status: 'completed',
          lockedBy: null,
          lockedUntil: null,
          leaseToken: null,
          errorCode: null,
          errorMessage: null
        }
      },
      { returnDocument: 'after' }
    );
    if (completed === null) throw this.lockConflict();
    return completed;
  }

  async fail(
    id: string,
    workerId: string,
    leaseToken: string,
    failure: JobFailure,
    now = new Date()
  ): Promise<JobDocument> {
    const current = this.date(now, 'now');
    const errorCode = this.bounded(failure.errorCode.trim(), 100, 'error code');
    const errorMessage = this.bounded(failure.errorMessage.trim(), 1000, 'error message');
    const retryable = failure.retryable !== false;
    const terminal = {
      $or: [{ $gte: ['$attempts', '$maxAttempts'] }, { $eq: [retryable, false] }]
    };
    const backoff = {
      $min: [
        MAX_BACKOFF_MS,
        { $multiply: [1_000, { $pow: [2, { $max: [0, { $subtract: ['$attempts', 1] }] }] }] }
      ]
    };
    const failed = await this.jobs.findOneAndUpdate(
      this.activeLeaseFilter(id, workerId, leaseToken, current),
      [
        {
          $set: {
            status: { $cond: [terminal, 'failed', 'queued'] },
            lockedBy: null,
            lockedUntil: null,
            leaseToken: null,
            errorCode,
            errorMessage,
            runAt: {
              $cond: [
                terminal,
                current,
                { $dateAdd: { startDate: current, unit: 'millisecond', amount: backoff } }
              ]
            }
          }
        }
      ] as never,
      { returnDocument: 'after', updatePipeline: true }
    );
    if (failed === null) throw this.lockConflict();
    return failed;
  }

  private activeLeaseFilter(id: string, workerId: string, leaseToken: string, now: Date) {
    return {
      _id: this.objectId(id),
      status: 'leased' as const,
      lockedBy: this.workerId(workerId),
      leaseToken: this.leaseToken(leaseToken),
      lockedUntil: { $gt: this.date(now, 'now') }
    };
  }

  private async reconcileExhaustedLeases(now: Date): Promise<void> {
    await this.jobs.updateMany(
      {
        status: 'leased',
        lockedUntil: { $lte: now },
        $expr: { $gte: ['$attempts', '$maxAttempts'] }
      },
      {
        $set: {
          status: 'failed',
          lockedBy: null,
          lockedUntil: null,
          leaseToken: null,
          errorCode: 'JOB_ATTEMPTS_EXHAUSTED',
          errorMessage: 'The job exhausted its retry budget after lease expiry.',
          runAt: now
        }
      }
    );
  }

  private sameOptionalDate(left: Date | null | undefined, right: Date | null): boolean {
    if (left === null || left === undefined || right === null)
      return (left === null || left === undefined) && right === null;
    return left.getTime() === right.getTime();
  }

  private objectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id))
      throw new DomainError('JOB_NOT_FOUND', 'Job was not found.', 404);
    return new Types.ObjectId(id);
  }

  private maxAttempts(value: number): number {
    if (!Number.isInteger(value) || value < 1 || value > 20)
      throw new DomainError(
        'VALIDATION_ERROR',
        'maxAttempts must be an integer between 1 and 20.',
        400
      );
    return value;
  }

  private leaseMs(value: number): number {
    if (!Number.isInteger(value) || value < MIN_LEASE_MS || value > MAX_LEASE_MS)
      throw new DomainError(
        'VALIDATION_ERROR',
        `leaseMs must be an integer between ${MIN_LEASE_MS} and ${MAX_LEASE_MS}.`,
        400
      );
    return value;
  }

  private date(value: Date, name: string): Date {
    if (!(value instanceof Date) || Number.isNaN(value.getTime()))
      throw new DomainError('VALIDATION_ERROR', `${name} must be a valid date.`, 400);
    return value;
  }

  private workerId(value: string): string {
    return this.bounded(value.trim(), 200, 'worker id');
  }

  private leaseToken(value: string): string {
    return this.bounded(value.trim(), 200, 'lease token');
  }

  private idempotencyKey(value: string): string {
    return this.bounded(value.trim(), 200, 'idempotency key');
  }

  private bounded(value: string, max: number, name: string): string {
    if (value.length === 0 || value.length > max)
      throw new DomainError('VALIDATION_ERROR', `A bounded nonempty ${name} is required.`, 400);
    return value;
  }

  private lockConflict(): DomainError {
    return new DomainError(
      'JOB_LOCK_CONFLICT',
      'The job lease is no longer held by this worker.',
      409
    );
  }

  private isDuplicate(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 11000
    );
  }
}
