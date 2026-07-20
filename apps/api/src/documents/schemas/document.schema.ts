import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { DocumentStatus, DocumentType } from '@marxmatrix/contracts';
import { Schema as MongooseSchema, Types, type HydratedDocument } from 'mongoose';

export type StoredDocument = HydratedDocument<DocumentRecord>;

@Schema({ timestamps: true, versionKey: false })
export class DocumentRecord {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  ownerId!: Types.ObjectId;
  @Prop({ required: true, trim: true, maxlength: 300 }) title!: string;
  /** Assigned only by an admin when a document is published into a course corpus. */
  @Prop({
    type: String,
    default: null,
    uppercase: true,
    trim: true,
    maxlength: 18,
    match: /^[A-Z]{2,12}\d{2,6}$/,
    index: true
  })
  courseId!: string | null;
  @Prop({ type: String, required: true, enum: ['financial_report', 'textbook'] })
  type!: DocumentType;
  @Prop({
    type: String,
    required: true,
    enum: ['uploaded', 'parsing', 'parsed', 'embedding', 'ready', 'failed']
  })
  status!: DocumentStatus;
  @Prop({ required: true, enum: ['application/pdf'] }) mimeType!: 'application/pdf';
  @Prop({ required: true, maxlength: 255 }) originalFileName!: string;
  @Prop({ required: true, min: 1 }) byteSize!: number;
  @Prop({ required: true, match: /^[a-f\d]{64}$/i, index: true }) checksum!: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, select: false })
  gridFsFileId!: Types.ObjectId;
  @Prop({ required: true, default: 0, min: 0 }) pageCount!: number;
  @Prop({ type: String, default: null }) errorCode!: string | null;
  @Prop({ type: String, default: null }) errorMessage!: string | null;
  @Prop({ type: String, enum: ['active', 'deleting'], default: 'active', select: false })
  deletionState!: 'active' | 'deleting';
  @Prop({ type: Date, default: null, select: false }) deletionClaimedAt!: Date | null;
  @Prop({ type: Date, default: null, select: false }) parsingStartedAt!: Date | null;
  @Prop({ type: String, default: null, select: false }) parsingToken!: string | null;
  @Prop({ type: String, default: null, select: false }) parsedPageToken!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
export const DocumentRecordSchema = SchemaFactory.createForClass(DocumentRecord);
DocumentRecordSchema.index({ ownerId: 1, updatedAt: -1 });
DocumentRecordSchema.index({ ownerId: 1, checksum: 1 }, { unique: true });
