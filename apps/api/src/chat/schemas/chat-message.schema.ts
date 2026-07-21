import type { ChatScope } from '@marxmatrix/contracts';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types, type HydratedDocument } from 'mongoose';

export interface ChatMessageUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
}

export type StoredChatMessage = HydratedDocument<ChatMessageRecord>;

@Schema({ timestamps: true, versionKey: false })
export class ChatMessageRecord {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) ownerId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) conversationId!: Types.ObjectId;
  @Prop({ type: String, required: true, enum: ['user', 'assistant'] })
  role!: 'user' | 'assistant';
  @Prop({
    type: String,
    cast: false,
    default: '',
    maxlength: 20_000,
    validate: {
      validator: (value: unknown) => typeof value === 'string',
      message: 'Message text must be a string.'
    }
  })
  text!: string;
  @Prop({ type: [MongooseSchema.Types.ObjectId], required: true, default: [] })
  attachmentIds!: Types.ObjectId[];
  @Prop({
    type: String,
    required: true,
    enum: ['pending', 'completed', 'refused', 'failed', 'cancelled']
  })
  status!: 'pending' | 'completed' | 'refused' | 'failed' | 'cancelled';
  @Prop({
    type: String,
    enum: ['education', 'finance', 'mixed', 'ambiguous', 'out_of_scope'],
    default: null
  })
  scope!: ChatScope | null;
  @Prop({ type: String, enum: ['scope_ambiguous', 'out_of_scope'], default: null })
  reasonCode!: 'scope_ambiguous' | 'out_of_scope' | null;
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null })
  replyToMessageId!: Types.ObjectId | null;
  @Prop({ type: String, trim: true, maxlength: 200, default: null }) providerModel!: string | null;
  @Prop({ type: String, trim: true, maxlength: 100, default: null }) promptVersion!: string | null;
  @Prop({
    type: {
      inputTokens: { type: Number, min: 0, default: null },
      outputTokens: { type: Number, min: 0, default: null },
      totalTokens: { type: Number, min: 0, default: null }
    },
    _id: false,
    default: null
  })
  usage!: ChatMessageUsage | null;
  createdAt!: Date;
  updatedAt!: Date;
}

export const ChatMessageRecordSchema = SchemaFactory.createForClass(ChatMessageRecord);
ChatMessageRecordSchema.index({ ownerId: 1, conversationId: 1, createdAt: 1, _id: 1 });
