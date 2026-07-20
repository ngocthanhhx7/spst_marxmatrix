import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types, type HydratedDocument } from 'mongoose';
import { RAG_EMBEDDING_DIMENSION } from '@marxmatrix/contracts';

export type StoredRagChunk = HydratedDocument<RagChunkRecord>;

@Schema({ timestamps: true, versionKey: false })
export class RagChunkRecord {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  ownerId!: Types.ObjectId;
  @Prop({ type: String, required: true, uppercase: true, trim: true, maxlength: 18 })
  courseId!: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  documentId!: Types.ObjectId;
  @Prop({ type: String, required: true, select: false }) parseToken!: string;
  @Prop({ required: true, min: 1 }) pageStart!: number;
  @Prop({ required: true, min: 1 }) pageEnd!: number;
  @Prop({ required: true, minlength: 1, maxlength: 20_000 }) text!: string;
  @Prop({ required: true, match: /^[a-f\d]{64}$/i }) checksum!: string;
  @Prop({
    type: [Number],
    required: true,
    validate: [
      (value: number[]) => value.length === RAG_EMBEDDING_DIMENSION,
      `embedding must contain ${RAG_EMBEDDING_DIMENSION} dimensions`
    ]
  })
  embedding!: number[];
  createdAt!: Date;
  updatedAt!: Date;
}

export const RagChunkRecordSchema = SchemaFactory.createForClass(RagChunkRecord);
RagChunkRecordSchema.index(
  { ownerId: 1, courseId: 1, documentId: 1, parseToken: 1, checksum: 1 },
  { unique: true, name: 'rag_chunk_idempotency' }
);
RagChunkRecordSchema.index(
  { ownerId: 1, courseId: 1, documentId: 1, pageStart: 1, pageEnd: 1 },
  { name: 'rag_retrieval_scope' }
);
