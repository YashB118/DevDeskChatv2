import { apiClient } from '@/lib/http/client';
import type { ChatId, UserId } from '@/shared/types/ids';
import {
  AssignmentListResponseSchema,
  type AssignmentList,
} from '../types';

interface ListParams {
  cursor?: string | null;
  limit?: number;
  userId?: UserId;
  chatId?: ChatId;
  activeOnly?: boolean;
}

export const assignmentsApi = {
  /**
   * Backend `GET /api/admin/assignments` returns `{ assignments: [...] }` with
   * no cursor — we wrap into the frontend's paged shape to keep the existing
   * `useInfiniteQuery` happy.
   */
  async list({ cursor: _cursor, limit = 200, userId, chatId, activeOnly }: ListParams = {}): Promise<AssignmentList> {
    const params: Record<string, string | number | boolean> = { limit };
    if (userId) params.userId = userId;
    if (chatId) params.chatId = chatId;
    if (activeOnly !== undefined) params.activeOnly = activeOnly;
    const res = await apiClient.get<unknown>('/api/admin/assignments', { params });
    const { assignments } = AssignmentListResponseSchema.parse(res.data);
    return { items: assignments, nextCursor: null };
  },

  async assign(chatId: ChatId, userId: UserId): Promise<void> {
    await apiClient.post('/api/admin/assignments', { chatId, userId });
  },

  async unassign(assignmentId: string): Promise<void> {
    await apiClient.delete(`/api/admin/assignments/${assignmentId}`);
  },

  async findActiveAssignmentIdForChat(chatId: ChatId): Promise<string | null> {
    const page = await this.list({ chatId, activeOnly: true, limit: 1 });
    return page.items[0]?.id ?? null;
  },
};
