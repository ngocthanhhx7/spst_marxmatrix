import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, type HydratedDocument, Types } from 'mongoose';
import type { ArenaState } from '../../arena/engine/arena.types.js';
import type { GameConfig } from '@marxmatrix/contracts';

export type GameDocument = HydratedDocument<Game>;

@Schema({ _id: false, versionKey: false })
export class PendingGameEvent {
  @Prop({ required: true, min: 1 }) sequence!: number;
  @Prop({ required: true, maxlength: 100 }) type!: string;
  @Prop({ required: true, min: 1 }) round!: number;
  @Prop({ type: MongooseSchema.Types.ObjectId, default: null }) playerId!: Types.ObjectId | null;
  @Prop({ type: String, default: null }) idempotencyKey!: string | null;
  @Prop({ type: MongooseSchema.Types.Mixed, required: true, default: {} }) payload!: Record<
    string,
    unknown
  >;
  @Prop({ type: Date, required: true }) createdAt!: Date;
}
export const PendingGameEventSchema = SchemaFactory.createForClass(PendingGameEvent);

@Schema({ timestamps: true, versionKey: false, minimize: false })
export class Game {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) roomId!: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) config!: GameConfig;
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) snapshot!: ArenaState;
  @Prop({ required: true, min: 0, default: 0 }) stateVersion!: number;
  @Prop({ required: true, min: 0, default: 0 }) eventSequence!: number;
  @Prop({ type: [String], required: true, default: [] }) appliedIdempotencyKeys!: string[];
  @Prop({ type: [PendingGameEventSchema], required: true, default: [] })
  pendingEvents!: PendingGameEvent[];
  createdAt!: Date;
  updatedAt!: Date;
}
export const GameSchema = SchemaFactory.createForClass(Game);
GameSchema.index({ roomId: 1 }, { unique: true });
