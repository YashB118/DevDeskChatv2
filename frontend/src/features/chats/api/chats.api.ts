import { z } from 'zod';
import { apiClient } from '@/lib/http/client';
import type { ChatId, UserId } from '@/shared/types/ids';
import {
  type ChatDTO,
  type ChatFilters,
  type ChatKind,
  type ChatListPage,
  type ChatPreview,
} from '../types';

interface ListParams {
  filters: ChatFilters;
  cursor?: string | null;
  limit?: number;
}

const BackendChatPreviewSchema = z.object({
  id: z.string(),
  body: z.string(),
  timestamp: z.number(),
  fromMe: z.boolean(),
});

const BackendChatSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  isGroup: z.boolean(),
  unreadCount: z.number(),
  lastMessage: BackendChatPreviewSchema.nullable(),
  displayNameOverride: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  muted: z.boolean(),
});

const BackendChatListEnvelopeSchema = z.object({
  chats: z.array(BackendChatSchema),
});

type BackendChat = z.infer<typeof BackendChatSchema>;

function mapPreview(p: BackendChat['lastMessage']): ChatPreview | null {
  if (p === null) return null;
  return { messageId: p.id, preview: p.body, ts: p.timestamp, fromSelf: p.fromMe };
}

function mapChat(c: BackendChat): ChatDTO {
  const kind: ChatKind = c.isGroup ? 'GROUP' : 'INDIVIDUAL';
  return {
    id: c.id,
    kind,
    title: c.displayNameOverride ?? c.name ?? c.id,
    unreadCount: c.unreadCount,
    muted: c.muted,
    pinned: false,
    assignedTo: null,
    sessionId: null,
    lastMessage: mapPreview(c.lastMessage),
    updatedAt: c.lastMessage?.timestamp ?? 0,
  };
}

function applyClientFilters(chats: ChatDTO[], f: ChatFilters): ChatDTO[] {
  return chats.filter((c) => {
    if (f.unreadOnly && c.unreadCount === 0) return false;
    if (f.hideMuted && c.muted) return false;
    if (f.kinds.length > 0 && !f.kinds.includes(c.kind)) return false;
    // assignedToMe: backend doesn't expose assignment in this response yet;
    // skip until the contract carries it.
    return true;
  });
}

const AssignmentRowSchema = z.object({
  id: z.string().uuid(),
});
const AssignmentListEnvelopeSchema = z.object({
  assignments: z.array(AssignmentRowSchema),
});

export const chatsApi = {
  async list({ filters, cursor, limit = 50 }: ListParams): Promise<ChatListPage> {
    // Backend currently requires `session` and only supports (limit, offset)
    // pagination. Without a session selected there's nothing to fetch.
    if (filters.sessionId === null) return { items: [], nextCursor: null };
    const offset = cursor === undefined || cursor === null ? 0 : Number.parseInt(cursor, 10);
    const safeOffset = Number.isFinite(offset) ? offset : 0;
    const res = await apiClient.get<unknown>('/api/chats', {
      params: { session: filters.sessionId, limit, offset: safeOffset },
    });
    const parsed = BackendChatListEnvelopeSchema.parse(res.data);
    const items = applyClientFilters(parsed.chats.map(mapChat), filters);
    const nextCursor =
      parsed.chats.length === limit ? String(safeOffset + parsed.chats.length) : null;
    return { items, nextCursor };
  },

  async markRead(chatId: ChatId): Promise<void> {
    await apiClient.post(`/api/chats/${chatId}/read`);
  },

  async setMuted(chatId: ChatId, muted: boolean): Promise<void> {
    await apiClient.post('/api/mute/chat', { chatId, muted });
  },

  /**
   * Chat-row quick assign / unassign. Backend has no chat-scoped assignment
   * endpoint — both operations go through `/api/admin/assignments`. Unassign
   * needs the active assignment row's UUID, looked up via the same endpoint.
   */
  async assign(chatId: ChatId, userId: UserId | null): Promise<void> {
    if (userId === null) {
      const list = await apiClient.get<unknown>('/api/admin/assignments', {
        params: { chatId, activeOnly: true, limit: 1 },
      });
      const parsed = AssignmentListEnvelopeSchema.parse(list.data);
      const target = parsed.assignments[0];
      if (!target) return;
      await apiClient.delete(`/api/admin/assignments/${target.id}`);
      return;
    }
    await apiClient.post('/api/admin/assignments', { chatId, userId });
  },
};
