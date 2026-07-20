import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, type HydratedDocument, Types } from 'mongoose';

export type GameEventDocument = HydratedDocument<GameEvent>;

@Schema({ timestamps: { createdAt: true, updatedAt: false }, versionKey: false })
export class GameEvent {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  gameId!: Types.ObjectId;
  @Prop({ required: true, min: 1 }) sequence!: number;
  @Prop({ required: true, maxlength: 100 }) type!: string;
  @Prop({ required: true, min: 1 }) round!: number;
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null }) playerId!: Types.ObjectId | null;
  @Prop({ type: String, default: null }) idempotencyKey!: string | null;
  @Prop({ type: MongooseSchema.Types.Mixed, required: true, default: {} }) payload!: Record<
    string,
    unknown
  >;
  createdAt!: Date;
}
export const GameEventSchema = SchemaFactory.createForClass(GameEvent);
GameEventSchema.index({ gameId: 1, sequence: 1 }, { unique: true });
GameEventSchema.index(
  { gameId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);
