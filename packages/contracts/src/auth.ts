import { z } from 'zod';
import { objectIdSchema } from './common.js';

export const roleSchema = z.enum(['student', 'admin']);
const emailSchema = z
  .string({ error: 'Vui lòng nhập email.' })
  .trim()
  .min(1, 'Vui lòng nhập email.')
  .email('Vui lòng nhập email hợp lệ.')
  .max(254, 'Email không được vượt quá 254 ký tự.')
  .toLowerCase();
export const registerInputSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(12, 'Mật khẩu cần ít nhất 12 ký tự.')
    .max(128, 'Mật khẩu không được vượt quá 128 ký tự.'),
  displayName: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập họ và tên.')
    .max(80, 'Họ và tên không được vượt quá 80 ký tự.')
});
export const loginInputSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, 'Vui lòng nhập mật khẩu.')
    .max(128, 'Mật khẩu không được vượt quá 128 ký tự.')
});
export const publicUserSchema = z.object({
  id: objectIdSchema,
  email: emailSchema,
  role: roleSchema,
  displayName: z.string().min(1).max(80)
});
export const authResponseSchema = z.object({
  accessToken: z.string().min(1),
  user: publicUserSchema
});
export const currentUserSchema = z.object({ user: publicUserSchema });
export type Role = z.infer<typeof roleSchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type PublicUser = z.infer<typeof publicUserSchema>;
