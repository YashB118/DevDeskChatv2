import { apiClient } from '@/lib/http/client';
import { FeedbackListSchema, type FeedbackList } from '../types';

interface ListParams {
  cursor?: string | null;
  limit?: number;
  unreadOnly?: boolean;
}

export const feedbackApi = {
  async list({ cursor, limit = 50, unreadOnly }: ListParams = {}): Promise<FeedbackList> {
    const res = await apiClient.get<unknown>('/api/feedback', {
      params: {
        limit,
        ...(cursor ? { cursor } : {}),
        ...(unreadOnly ? { unreadOnly: '1' } : {}),
      },
    });
    return FeedbackListSchema.parse(res.data);
  },

  async markRead(id: string): Promise<void> {
    await apiClient.patch(`/api/feedback/${id}`, { read: true });
  },
};
