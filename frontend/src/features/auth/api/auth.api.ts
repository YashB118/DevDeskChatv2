import { apiClient } from '@/lib/http/client';
import {
  LoginResponseSchema,
  RefreshResponseSchema,
  type LoginInput,
  type LoginResponse,
  type PasswordChangeInput,
  type RefreshResponse,
  UserSchema,
  type User,
} from '../types';

const skipRefresh = { _skipAuthRefresh: true } as never;

export const authApi = {
  async login(input: LoginInput): Promise<LoginResponse> {
    const res = await apiClient.post<unknown>('/api/auth/login', input, skipRefresh);
    return LoginResponseSchema.parse(res.data);
  },

  async refresh(): Promise<RefreshResponse> {
    const res = await apiClient.post<unknown>('/api/auth/refresh', undefined, skipRefresh);
    return RefreshResponseSchema.parse(res.data);
  },

  async logout(): Promise<void> {
    await apiClient.post('/api/auth/logout', undefined, skipRefresh);
  },

  async me(): Promise<User> {
    const res = await apiClient.get<unknown>('/api/auth/me');
    return UserSchema.parse(res.data);
  },

  async changePassword(input: PasswordChangeInput): Promise<void> {
    const { currentPassword, newPassword } = input;
    await apiClient.patch('/api/auth/password', { currentPassword, newPassword });
  },
};
