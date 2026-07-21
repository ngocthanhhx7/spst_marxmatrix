import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types, type HydratedDocument } from 'mongoose';

export type StoredChatConversation = HydratedDocument<ChatConversationRecord>;

@Schema({ timestamps: true, versionKey: false })
export class ChatConversationRecord {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) ownerId!: Types.ObjectId;
  @Prop({ required: true, trim: true, minlength: 1, maxlength: 80 }) title!: string;
  @Prop({ type: String, default: null }) activeRunId!: string | null;
  @Prop({ type: Date, default: null }) activeRunStartedAt!: Date | null;
  @Prop({ type: String, enum: ['active', 'deleted'], default: 'active' })
  deletionState!: 'active' | 'deleted';
  @Prop({ type: Date, default: null }) deletedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const ChatConversationRecordSchema = SchemaFactory.createForClass(ChatConversationRecord);
ChatConversationRecordSchema.index({ ownerId: 1, updatedAt: -1, _id: -1 });
