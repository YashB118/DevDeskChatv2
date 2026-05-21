import { apiClient } from '@/lib/http/client';
import { FeedbackListResponseSchema, type FeedbackList } from '../types';

interface ListParams {
  cursor?: string | null;
  limit?: number;
  unreadOnly?: boolean;
}

export const feedbackApi = {
  /**
   * Backend `GET /api/feedback` returns `{ feedback: [...] }` with no cursor —
   * wrap into the paged shape the infinite-query expects.
   */
  async list({ cursor: _cursor, limit = 50, unreadOnly }: ListParams = {}): Promise<FeedbackList> {
    const res = await apiClient.get<unknown>('/api/feedback', {
      params: {
        limit,
        ...(unreadOnly ? { unreadOnly: 'true' } : {}),
      },
    });
    const { feedback } = FeedbackListResponseSchema.parse(res.data);
    return { items: feedback, nextCursor: null };
  },

  async markRead(id: string): Promise<void> {
    await apiClient.patch(`/api/feedback/${id}`, { read: true });
  },
};
