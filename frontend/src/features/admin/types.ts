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
});
export type AdminUserDTO = z.infer<typeof AdminUserDTOSchema>;

export const AdminUserListSchema = z.object({
  users: z.array(AdminUserDTOSchema),
});
export type AdminUserList = z.infer<typeof AdminUserListSchema>;

export const CreateUserInputSchema = z.object({
  email: z.string().email('Enter a valid email'),
  displayName: z.string().min(1, 'Required'),
  password: z.string().min(8, 'At least 8 characters'),
  role: UserRoleSchema,
});
export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

export const UpdateUserInputSchema = z.object({
  displayName: z.string().min(1).optional(),
  role: UserRoleSchema.optional(),
  disabled: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof UpdateUserInputSchema>;
