import { apiClient } from '@/lib/http/client';
import type { UserId } from '@/shared/types/ids';
import {
  AdminUserDTOSchema,
  AdminUserListSchema,
  CreateUserInputSchema,
  UpdateUserInputSchema,
  type AdminUserDTO,
  type AdminUserList,
  type CreateUserInput,
  type UpdateUserInput,
} from '../types';

export const adminApi = {
  async listUsers(): Promise<AdminUserList> {
    const res = await apiClient.get<unknown>('/api/users');
    return AdminUserListSchema.parse(res.data);
  },

  async createUser(input: CreateUserInput): Promise<AdminUserDTO> {
    const parsed = CreateUserInputSchema.parse(input);
    const res = await apiClient.post<unknown>('/api/users', parsed);
    return AdminUserDTOSchema.parse(res.data);
  },

  async updateUser(userId: UserId, input: UpdateUserInput): Promise<AdminUserDTO> {
    const parsed = UpdateUserInputSchema.parse(input);
    const res = await apiClient.patch<unknown>(`/api/users/${userId}`, parsed);
    return AdminUserDTOSchema.parse(res.data);
  },

  async deleteUser(userId: UserId): Promise<void> {
    await apiClient.delete(`/api/users/${userId}`);
  },
};
