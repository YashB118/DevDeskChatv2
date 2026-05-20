import { apiClient } from '@/lib/http/client';
import type { ChatId, UserId } from '@/shared/types/ids';
import {
  AssignmentListSchema,
  type AssignmentList,
} from '../types';

interface ListParams {
  cursor?: string | null;
  limit?: number;
}

export const assignmentsApi = {
  async list({ cursor, limit = 100 }: ListParams = {}): Promise<AssignmentList> {
    const res = await apiClient.get<unknown>('/api/assignments', {
      params: {
        limit,
        ...(cursor ? { cursor } : {}),
      },
    });
    return AssignmentListSchema.parse(res.data);
  },

  async assign(chatId: ChatId, userId: UserId): Promise<void> {
    await apiClient.post(`/api/assignments`, { chatId, userId });
  },

  async unassign(chatId: ChatId): Promise<void> {
    await apiClient.delete(`/api/assignments/${chatId}`);
  },
};
