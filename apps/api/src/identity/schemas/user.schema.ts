import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

export type UserDocument = HydratedDocument<User>;
export type UserRole = 'student' | 'admin';

@Schema({ timestamps: true, versionKey: false })
export class User {
  @Prop({ required: true, unique: true, index: true, trim: true, lowercase: true, maxlength: 254 })
  email!: string;
  @Prop({ required: true, maxlength: 80, trim: true }) displayName!: string;
  @Prop({ required: true, select: false }) passwordHash!: string;
  @Prop({ required: true, type: String, enum: ['student', 'admin'], default: 'student' })
  role!: UserRole;
}

export const UserSchema = SchemaFactory.createForClass(User);
