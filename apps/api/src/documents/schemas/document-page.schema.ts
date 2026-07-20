import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types, type HydratedDocument } from 'mongoose';

export type StoredDocumentPage = HydratedDocument<DocumentPageRecord>;

@Schema({ timestamps: true, versionKey: false })
export class DocumentPageRecord {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  documentId!: Types.ObjectId;
  @Prop({ type: String, required: true, select: false }) parseToken!: string;
  @Prop({ required: true, min: 1 }) pageNumber!: number;
  @Prop({ required: true, default: '' }) text!: string;
  @Prop({ type: [MongooseSchema.Types.ObjectId], required: true, default: [] })
  sourceChunkIds!: Types.ObjectId[];
  createdAt!: Date;
  updatedAt!: Date;
}
export const DocumentPageRecordSchema = SchemaFactory.createForClass(DocumentPageRecord);
DocumentPageRecordSchema.index({ documentId: 1, parseToken: 1, pageNumber: 1 }, { unique: true });
