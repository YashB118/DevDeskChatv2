import { z } from 'zod';

export const UserRoleSchema = z.enum(['ADMIN', 'DEVELOPER']);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const AdminUserDTOSchema = z.object({
  id: z.string().min(1),
  email: z.string().email(),
  displayName: z.string().min(1),
  role: UserRoleSchema,
  disabled: z.boolean().default(false),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
export type AdminUserDTO = z.infer<typeof AdminUserDTOSchema>;

export const AdminUserListSchema = z.object({
  users: z.array(AdminUserDTOSchema),
});
export type AdminUserList = z.infer<typeof AdminUserListSchema>;

export const AdminUserEnvelopeSchema = z.object({
  user: AdminUserDTOSchema,
});

export const CreateUserInputSchema = z.object({
  email: z.string().email('Enter a valid email').max(254),
  displayName: z.string().min(1, 'Required').max(120),
  password: z.string().min(8, 'At least 8 characters').max(128),
  role: UserRoleSchema,
});
export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

/**
 * Backend `UpdateUserSchema` only accepts `displayName` and `role` and requires
 * at least one of them — the disabled flag flips via dedicated endpoints, not
 * a PATCH.
 */
export const UpdateUserInputSchema = z
  .object({
    displayName: z.string().min(1).max(120).optional(),
    role: UserRoleSchema.optional(),
  })
  .refine((v) => v.displayName !== undefined || v.role !== undefined, {
    message: 'Provide displayName or role',
  });
export type UpdateUserInput = z.infer<typeof UpdateUserInputSchema>;

export const ResetPasswordInputSchema = z.object({
  newPassword: z.string().min(8).max(128),
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordInputSchema>;
