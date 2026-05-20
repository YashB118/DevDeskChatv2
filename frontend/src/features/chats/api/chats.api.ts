import { apiClient } from '@/lib/http/client';
import type { ChatId, UserId } from '@/shared/types/ids';
import { ChatListPageSchema, type ChatFilters, type ChatListPage } from '../types';

interface ListParams {
  filters: ChatFilters;
  cursor?: string | null;
  limit?: number;
}

function serializeFilters(f: ChatFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (f.unreadOnly) params.unreadOnly = '1';
  if (f.assignedToMe) params.assignedToMe = '1';
  if (f.hideMuted) params.hideMuted = '1';
  if (f.kinds.length > 0) params.kinds = f.kinds.join(',');
  if (f.sessionId) params.sessionId = f.sessionId;
  return params;
}

export const chatsApi = {
  async list({ filters, cursor, limit = 50 }: ListParams): Promise<ChatListPage> {
    const res = await apiClient.get<unknown>('/api/chats', {
      params: {
        ...serializeFilters(filters),
        limit,
        ...(cursor ? { cursor } : {}),
      },
    });
    return ChatListPageSchema.parse(res.data);
  },

  async markRead(chatId: ChatId): Promise<void> {
    await apiClient.post(`/api/chats/${chatId}/read`);
  },

  async setMuted(chatId: ChatId, muted: boolean): Promise<void> {
    await apiClient.patch(`/api/chats/${chatId}/mute`, { muted });
  },

  async assign(chatId: ChatId, userId: UserId | null): Promise<void> {
    if (userId === null) {
      await apiClient.delete(`/api/chats/${chatId}/assignment`);
      return;
    }
    await apiClient.post(`/api/chats/${chatId}/assignment`, { userId });
  },
};
