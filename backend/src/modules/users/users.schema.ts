import { z } from 'zod';
import { UserRole } from './user.types';

export const CreateUserSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(120),
  role: z.nativeEnum(UserRole),
});
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdateUserSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    role: z.nativeEnum(UserRole).optional(),
  })
  .refine((v) => v.displayName !== undefined || v.role !== undefined, {
    message: 'At least one of displayName or role must be provided',
  });
export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

export const AdminPasswordResetSchema = z.object({
  newPassword: z.string().min(8).max(128),
});
export type AdminPasswordResetInput = z.infer<typeof AdminPasswordResetSchema>;

export const ListUsersQuerySchema = z.object({
  includeDisabled: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;
