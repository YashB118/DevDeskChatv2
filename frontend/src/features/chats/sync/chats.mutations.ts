import type { InfiniteData } from '@tanstack/react-query';
import type {
  ChatAssignedPayload,
  ChatMutedPayload,
  ChatReadPayload,
  ChatUnassignedPayload,
  MessageNewPayload,
} from '@/realtime/events.contract';
import type { ChatDTO, ChatListPage } from '../types';

type Pages = InfiniteData<ChatListPage> | undefined;

function mapPages(
  data: Pages,
  fn: (chat: ChatDTO) => ChatDTO,
): Pages {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map(fn),
    })),
  };
}

export function bumpChatWithMessage(data: Pages, payload: MessageNewPayload): Pages {
  if (!data) return data;
  const { chatId, message, preview } = payload;
  const current = data.pages.flatMap((p) => p.items).find((c) => c.id === chatId);
  if (!current) return data;

  const updated: ChatDTO = {
    ...current,
    unreadCount: preview.fromSelf ? current.unreadCount : current.unreadCount + 1,
    lastMessage: preview,
    updatedAt: message.ts,
  };

  const stripped = data.pages.map((page) => ({
    ...page,
    items: page.items.filter((c) => c.id !== chatId),
  }));
  const firstPage = stripped[0];
  if (!firstPage) return data;
  return {
    ...data,
    pages: [
      { ...firstPage, items: [updated, ...firstPage.items] },
      ...stripped.slice(1),
    ],
  };
}

export function applyAssigned(data: Pages, p: ChatAssignedPayload): Pages {
  return mapPages(data, (c) => (c.id === p.chatId ? { ...c, assignedTo: p.assignedTo } : c));
}

export function applyUnassigned(data: Pages, p: ChatUnassignedPayload): Pages {
  return mapPages(data, (c) => (c.id === p.chatId ? { ...c, assignedTo: null } : c));
}

export function applyRead(data: Pages, p: ChatReadPayload): Pages {
  return mapPages(data, (c) => (c.id === p.chatId ? { ...c, unreadCount: 0 } : c));
}

export function applyMuted(data: Pages, p: ChatMutedPayload): Pages {
  return mapPages(data, (c) => (c.id === p.chatId ? { ...c, muted: p.muted } : c));
}
