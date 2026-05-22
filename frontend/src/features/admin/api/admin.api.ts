import { apiClient } from '@/lib/http/client';
import type { UserId } from '@/shared/types/ids';
import {
  AdminUserEnvelopeSchema,
  AdminUserListSchema,
  CreateUserInputSchema,
  ResetPasswordInputSchema,
  UpdateUserInputSchema,
  type AdminUserDTO,
  type AdminUserList,
  type CreateUserInput,
  type ResetPasswordInput,
  type UpdateUserInput,
} from '../types';

const unwrapUser = (data: unknown): AdminUserDTO => AdminUserEnvelopeSchema.parse(data).user;

export const adminApi = {
  async listUsers(): Promise<AdminUserList> {
    const res = await apiClient.get<unknown>('/api/admin/users');
    return AdminUserListSchema.parse(res.data);
  },

  async createUser(input: CreateUserInput): Promise<AdminUserDTO> {
    const parsed = CreateUserInputSchema.parse(input);
    const res = await apiClient.post<unknown>('/api/admin/users', parsed);
    return unwrapUser(res.data);
  },

  async updateUser(userId: UserId, input: UpdateUserInput): Promise<AdminUserDTO> {
    const parsed = UpdateUserInputSchema.parse(input);
    const res = await apiClient.patch<unknown>(`/api/admin/users/${userId}`, parsed);
    return unwrapUser(res.data);
  },

  async setDisabled(userId: UserId, disabled: boolean): Promise<AdminUserDTO> {
    const path = disabled ? 'disable' : 'enable';
    const res = await apiClient.post<unknown>(`/api/admin/users/${userId}/${path}`);
    return unwrapUser(res.data);
  },

  async resetPassword(userId: UserId, input: ResetPasswordInput): Promise<void> {
    const parsed = ResetPasswordInputSchema.parse(input);
    await apiClient.post(`/api/admin/users/${userId}/password-reset`, parsed);
  },

  async deleteUser(userId: UserId): Promise<void> {
    // Backend soft-deletes by flipping disabled=true; we ignore the returned envelope.
    await apiClient.delete(`/api/admin/users/${userId}`);
  },
};
