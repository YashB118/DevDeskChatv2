import type { InfiniteData } from '@tanstack/react-query';
import type {
  ChatAssignmentPayload,
  ChatMutedPayload,
  ChatReadPayload,
  ChatUnassignmentPayload,
  MessageNewPayload,
} from '@/realtime/events.contract';
import type { ChatDTO, ChatListPage, ChatPreview } from '../types';

type Pages = InfiniteData<ChatListPage> | undefined;

function isoToMs(iso: string): number {
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : 0;
}

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

/**
 * Backend `message:new` payload is `{chatId, message: MessageDto}`. Derive the
 * preview locally so the chat row can render without a separate fetch. Use
 * `message.fromMe` to decide whether to bump unread.
 */
export function bumpChatWithMessage(data: Pages, payload: MessageNewPayload): Pages {
  if (!data) return data;
  const { chatId, message } = payload;
  const current = data.pages.flatMap((p) => p.items).find((c) => c.id === chatId);
  if (!current) return data;

  const ts = isoToMs(message.sentAt);
  const preview: ChatPreview = {
    messageId: message.id,
    preview: message.body ?? '',
    ts,
    fromSelf: message.fromMe,
  };
  const updated: ChatDTO = {
    ...current,
    unreadCount: message.fromMe ? current.unreadCount : current.unreadCount + 1,
    lastMessage: preview,
    updatedAt: ts,
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

export function applyAssigned(data: Pages, p: ChatAssignmentPayload): Pages {
  return mapPages(data, (c) => (c.id === p.chatId ? { ...c, assignedTo: p.userId } : c));
}

export function applyUnassigned(data: Pages, p: ChatUnassignmentPayload): Pages {
  return mapPages(data, (c) => (c.id === p.chatId ? { ...c, assignedTo: null } : c));
}

export function applyRead(data: Pages, p: ChatReadPayload): Pages {
  return mapPages(data, (c) => (c.id === p.chatId ? { ...c, unreadCount: 0 } : c));
}

export function applyMuted(data: Pages, p: ChatMutedPayload): Pages {
  return mapPages(data, (c) => (c.id === p.chatId ? { ...c, muted: p.muted } : c));
}
