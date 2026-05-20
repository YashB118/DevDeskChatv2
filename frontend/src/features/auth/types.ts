import { z } from 'zod';

export const UserRoleSchema = z.enum(['ADMIN', 'DEVELOPER']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: UserRoleSchema,
});
export type User = z.infer<typeof UserSchema>;

export const LoginResponseSchema = z.object({
  accessToken: z.string().min(1),
  user: UserSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const RefreshResponseSchema = z.object({
  accessToken: z.string().min(1),
  user: UserSchema,
});
export type RefreshResponse = z.infer<typeof RefreshResponseSchema>;

export const LoginInputSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const PasswordChangeInputSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm the new password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords must match',
  });
export type PasswordChangeInput = z.infer<typeof PasswordChangeInputSchema>;
