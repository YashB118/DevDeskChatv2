import type { InfiniteData } from '@tanstack/react-query';
import type {
  MessageAckPayload,
  MessageDeletedPayload,
  MessageEditedPayload,
  MessageNewPayload,
  MessageReactionPayload,
} from '@/realtime/events.contract';
import type { MessageDTO, MessagePage, SendMessageInput } from '../types';

export type MessagesCache = InfiniteData<MessagePage> | undefined;

/**
 * Cache shape: the most-recent page lives at pages[0], older pages append.
 * Within a page, items are ordered oldest → newest.
 */

function mapMessages(
  data: MessagesCache,
  fn: (m: MessageDTO) => MessageDTO,
): MessagesCache {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map(fn),
    })),
  };
}

function findMessage(data: MessagesCache, messageId: string): MessageDTO | null {
  if (!data) return null;
  for (const page of data.pages) {
    for (const m of page.items) {
      if (m.id === messageId || m.tempId === messageId) return m;
    }
  }
  return null;
}

export function makeTempId(): string {
  return `tmp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function buildPending(
  chatId: string,
  senderId: string,
  input: SendMessageInput,
  tempId: string,
): MessageDTO {
  return {
    id: tempId,
    tempId,
    chatId,
    senderId,
    body: input.body,
    type: input.type ?? 'TEXT',
    ts: Date.now(),
    editedAt: null,
    deletedAt: null,
    reactions: [],
    quoted: input.quoted ?? null,
    forwarded: false,
    media: null,
    status: 'pending',
  };
}

export function appendOptimistic(data: MessagesCache, optimistic: MessageDTO): MessagesCache {
  if (!data) {
    return {
      pages: [{ items: [optimistic], nextCursor: null }],
      pageParams: [null],
    };
  }
  const firstPage = data.pages[0];
  if (!firstPage) {
    return {
      ...data,
      pages: [{ items: [optimistic], nextCursor: null }],
    };
  }
  return {
    ...data,
    pages: [
      { ...firstPage, items: [...firstPage.items, optimistic] },
      ...data.pages.slice(1),
    ],
  };
}

export function reconcileSend(
  data: MessagesCache,
  tempId: string,
  server: MessageDTO,
): MessagesCache {
  if (!data) return data;
  const replaced = { value: false };
  const next = {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((m) => {
        if ((m.tempId !== undefined && m.tempId === tempId) || m.id === tempId) {
          replaced.value = true;
          return { ...server, status: 'confirmed' as const, tempId: undefined };
        }
        return m;
      }),
    })),
  };
  return replaced.value ? next : appendOptimistic(data, { ...server, status: 'confirmed' });
}

export function markFailed(data: MessagesCache, tempId: string): MessagesCache {
  return mapMessages(data, (m) =>
    m.tempId === tempId || m.id === tempId ? { ...m, status: 'failed' } : m,
  );
}

export function applyMessageNew(data: MessagesCache, payload: MessageNewPayload): MessagesCache {
  const partial = payload.message;
  const existing = findMessage(data, partial.id);
  if (existing) return data;

  const enriched: MessageDTO = {
    id: partial.id,
    chatId: partial.chatId,
    senderId: partial.senderId,
    body: partial.body,
    type: partial.type,
    ts: partial.ts,
    editedAt: null,
    deletedAt: null,
    reactions: [],
    quoted: null,
    forwarded: false,
    media: null,
    status: 'confirmed',
  };
  return appendOptimistic(data, enriched);
}

export function applyAck(data: MessagesCache, payload: MessageAckPayload): MessagesCache {
  return mapMessages(data, (m) =>
    m.id === payload.messageId ? { ...m, ackState: payload.state } : m,
  );
}

export function applyEdit(
  data: MessagesCache,
  payload: MessageEditedPayload | { messageId: string; body: string; editedAt?: number },
): MessagesCache {
  return mapMessages(data, (m) =>
    m.id === payload.messageId
      ? { ...m, body: payload.body, editedAt: payload.editedAt ?? Date.now() }
      : m,
  );
}

export function applyDelete(
  data: MessagesCache,
  payload: MessageDeletedPayload | { messageId: string; deletedAt?: number },
): MessagesCache {
  return mapMessages(data, (m) =>
    m.id === payload.messageId
      ? { ...m, deletedAt: payload.deletedAt ?? Date.now(), body: '' }
      : m,
  );
}

export function applyReaction(data: MessagesCache, payload: MessageReactionPayload): MessagesCache {
  return mapMessages(data, (m) => {
    if (m.id !== payload.messageId) return m;
    const filtered = m.reactions.filter((r) => r.userId !== payload.userId);
    const next = payload.emoji ? [...filtered, { userId: payload.userId, emoji: payload.emoji }] : filtered;
    return { ...m, reactions: next };
  });
}

export function prependOlderPage(data: MessagesCache, page: MessagePage): MessagesCache {
  if (!data) {
    return { pages: [page], pageParams: [null] };
  }
  return {
    ...data,
    pages: [page, ...data.pages],
  };
}
