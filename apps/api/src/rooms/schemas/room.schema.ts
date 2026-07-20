import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Schema as MongooseSchema, type HydratedDocument, Types } from 'mongoose';
import type { GameConfig } from '@marxmatrix/contracts';

export type RoomDocument = HydratedDocument<Room>;

@Schema({ _id: false, versionKey: false })
export class RoomPlayer {
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true }) userId!: Types.ObjectId;
  @Prop({ required: true, maxlength: 100 }) displayName!: string;
  @Prop({ required: true, default: false }) isBot!: boolean;
}
export const RoomPlayerSchema = SchemaFactory.createForClass(RoomPlayer);

@Schema({ timestamps: true, versionKey: false })
export class Room {
  @Prop({ required: true, uppercase: true, match: /^[A-Z0-9]{6}$/ }) code!: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true, index: true })
  hostId!: Types.ObjectId;
  @Prop({ type: [RoomPlayerSchema], required: true, default: [] }) players!: RoomPlayer[];
  @Prop({ type: [MongooseSchema.Types.ObjectId], required: true, default: [] })
  readyPlayerIds!: Types.ObjectId[];
  @Prop({ required: true, enum: ['lobby', 'started'], default: 'lobby', index: true }) phase!:
    | 'lobby'
    | 'started';
  @Prop({ type: MongooseSchema.Types.Mixed, required: true }) config!: GameConfig;
  @Prop({ required: true, default: 0, min: 0 }) stateVersion!: number;
  @Prop({ type: Date, default: null }) expiresAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}
export const RoomSchema = SchemaFactory.createForClass(Room);
RoomSchema.index({ code: 1 }, { unique: true });
RoomSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
RoomSchema.index({ 'players.userId': 1, phase: 1 });
