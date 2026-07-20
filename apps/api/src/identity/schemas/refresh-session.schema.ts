import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, Types, type HydratedDocument } from 'mongoose';

export type RefreshSessionDocument = HydratedDocument<RefreshSession>;

@Schema({ timestamps: true, versionKey: false })
export class RefreshSession {
  @Prop({ required: true, index: true }) tokenHash!: string;
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'User', index: true })
  userId!: Types.ObjectId;
  @Prop({ required: true, index: { expires: 0 } }) expiresAt!: Date;
  @Prop() revokedAt?: Date;
  @Prop() replacedByHash?: string;
  @Prop({ index: true }) rotationLockHash?: string;
  @Prop({ index: true }) rotationLockExpiresAt?: Date;
}

export const RefreshSessionSchema = SchemaFactory.createForClass(RefreshSession);
RefreshSessionSchema.index({ userId: 1, tokenHash: 1 }, { unique: true });
// Keep this lookup index portable across the MongoDB versions used in local
// development and CI. The query still filters active sessions by revokedAt;
// the partial-index optimization is not supported by every supported server.
RefreshSessionSchema.index({ tokenHash: 1, revokedAt: 1, expiresAt: 1 });
