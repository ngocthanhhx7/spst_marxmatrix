import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { JobPayload, JobStatus, JobType } from '@marxmatrix/contracts';
import { Schema as MongooseSchema, Types, type HydratedDocument } from 'mongoose';

export type JobDocument = HydratedDocument<Job>;

@Schema({ _id: false, versionKey: false })
export class StoredJobPayload {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) documentId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null }) analysisId!: Types.ObjectId | null;
}
export const StoredJobPayloadSchema = SchemaFactory.createForClass(StoredJobPayload);

@Schema({ timestamps: true, versionKey: false })
export class Job {
  @Prop({
    type: String,
    required: true,
    enum: ['parse_pdf', 'extract_financials', 'embed_document', 'rebuild_document_index']
  })
  type!: JobType;
  @Prop({
    type: String,
    required: true,
    enum: ['queued', 'leased', 'completed', 'failed', 'cancelled'],
    index: true
  })
  status!: JobStatus;
  @Prop({ type: StoredJobPayloadSchema, required: true }) payload!: StoredJobPayload;
  @Prop({ required: true, maxlength: 200 }) idempotencyKey!: string;
  @Prop({ required: true, default: 0, min: 0 }) attempts!: number;
  @Prop({ required: true, default: 3, min: 1, max: 20 }) maxAttempts!: number;
  /** Explicit caller scheduling policy; null means immediately eligible. */
  @Prop({ type: Date, default: null }) requestedRunAt!: Date | null;
  @Prop({ required: true, index: true }) runAt!: Date;
  @Prop({ type: String, default: null }) lockedBy!: string | null;
  @Prop({ type: Date, default: null, index: true }) lockedUntil!: Date | null;
  /** Rotates on every claim so a stale attempt cannot act as a later one. */
  @Prop({ type: String, default: null }) leaseToken!: string | null;
  @Prop({ type: String, default: null }) errorCode!: string | null;
  @Prop({ type: String, default: null }) errorMessage!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
export const JobSchema = SchemaFactory.createForClass(Job);
/** A key denotes exactly one canonical enqueue request across every job type. */
JobSchema.index({ idempotencyKey: 1 }, { unique: true, name: 'job_idempotency_key_unique' });
JobSchema.index({ status: 1, runAt: 1, lockedUntil: 1 });
JobSchema.index({ status: 1, lockedUntil: 1 }, { name: 'job_expired_lease_lookup' });

export type StoredJobPayloadType = JobPayload;
