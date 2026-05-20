import { z } from 'zod';

export const LoginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const PasswordChangeSchema = z.object({
  currentPassword: z.string().min(8).max(128),
  newPassword: z.string().min(8).max(128),
});
export type PasswordChangeInput = z.infer<typeof PasswordChangeSchema>;
