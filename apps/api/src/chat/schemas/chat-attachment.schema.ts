import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types, type HydratedDocument } from 'mongoose';

export type StoredChatAttachment = HydratedDocument<ChatAttachmentRecord>;

@Schema({ timestamps: true, versionKey: false })
export class ChatAttachmentRecord {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) ownerId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) conversationId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) messageId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, select: false })
  gridFsFileId!: Types.ObjectId;
  @Prop({ required: true, maxlength: 255 }) originalFileName!: string;
  @Prop({ required: true, enum: ['image/jpeg', 'image/png', 'image/webp'] })
  mimeType!: 'image/jpeg' | 'image/png' | 'image/webp';
  @Prop({ required: true, min: 1, max: 5 * 1024 * 1024 }) byteSize!: number;
  @Prop({ required: true, match: /^[a-f\d]{64}$/i }) checksum!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

export const ChatAttachmentRecordSchema = SchemaFactory.createForClass(ChatAttachmentRecord);
ChatAttachmentRecordSchema.index({ ownerId: 1, conversationId: 1 });
