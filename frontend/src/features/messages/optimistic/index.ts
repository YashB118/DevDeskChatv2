import type { InfiniteData } from '@tanstack/react-query';
import type {
  MessageAckPayload,
  MessageDeletedPayload,
  MessageEditedPayload,
  MessageNewPayload,
  MessageReactionPayload,
} from '@/realtime/events.contract';
import type {
  MessageDTO,
  MessagePage,
  MessageType,
  SendMessageInput,
  SendMessageResponse,
} from '../types';

export type MessagesCache = InfiniteData<MessagePage> | undefined;

const KNOWN_TYPES = new Set<MessageType>([
  'TEXT',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'DOCUMENT',
  'STICKER',
  'SYSTEM',
]);
function coerceType(t: string): MessageType {
  const upper = t.toUpperCase();
  return KNOWN_TYPES.has(upper as MessageType) ? (upper as MessageType) : 'TEXT';
}
function isoToMs(iso: string): number {
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : 0;
}

/**
 * Cache shape: the most-recent page lives at pages[0], older pages append.
 * Within a page, items are ordered oldest → newest. Events from the wire are
 * keyed by `stanzaId`; locally generated bubbles match by `id` / `tempId`.
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

function findById(data: MessagesCache, messageId: string): MessageDTO | null {
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
    stanzaId: tempId,
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
  server: SendMessageResponse,
): MessagesCache {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((m) =>
        (m.tempId !== undefined && m.tempId === tempId) || m.id === tempId
          ? { ...m, id: server.id, stanzaId: server.stanzaId, status: 'confirmed' as const, tempId: undefined }
          : m,
      ),
    })),
  };
}

export function markFailed(data: MessagesCache, tempId: string): MessagesCache {
  return mapMessages(data, (m) =>
    m.tempId === tempId || m.id === tempId ? { ...m, status: 'failed' } : m,
  );
}

export function applyMessageNew(data: MessagesCache, payload: MessageNewPayload): MessagesCache {
  const m = payload.message;
  const existing = findById(data, m.id);
  if (existing) return data;

  const enriched: MessageDTO = {
    id: m.id,
    stanzaId: m.stanzaId,
    chatId: m.chatId,
    senderId: m.fromJid,
    body: m.body ?? '',
    type: coerceType(m.type),
    ts: isoToMs(m.sentAt),
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

/** Match events by `stanzaId` (the wire id). Local optimistic rows carry the
 *  tempId as stanzaId until {@link reconcileSend} swaps it for the real one. */
export function applyAck(data: MessagesCache, payload: MessageAckPayload): MessagesCache {
  return mapMessages(data, (m) =>
    m.stanzaId === payload.stanzaId ? { ...m, ackState: payload.ack } : m,
  );
}

export function applyEdit(
  data: MessagesCache,
  payload: MessageEditedPayload | { messageId: string; body: string; editedAt?: number },
): MessagesCache {
  // Two shapes: the realtime payload (stanzaId + newBody + ISO editedAt) and
  // the local optimistic shape (messageId + body + numeric editedAt) used by
  // the edit mutation. Branch on which fields are present.
  if ('stanzaId' in payload) {
    return mapMessages(data, (m) =>
      m.stanzaId === payload.stanzaId
        ? { ...m, body: payload.newBody ?? '', editedAt: isoToMs(payload.editedAt) }
        : m,
    );
  }
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
  if ('stanzaId' in payload) {
    return mapMessages(data, (m) =>
      m.stanzaId === payload.stanzaId
        ? { ...m, deletedAt: isoToMs(payload.deletedAt), body: '' }
        : m,
    );
  }
  return mapMessages(data, (m) =>
    m.id === payload.messageId
      ? { ...m, deletedAt: payload.deletedAt ?? Date.now(), body: '' }
      : m,
  );
}

/**
 * Local optimistic shape uses {messageId, userId, emoji}. The realtime payload
 * uses {stanzaId, senderJid, emoji, removed}. Both branches converge on:
 * filter out (user, *) entries, optionally re-add (user, emoji).
 */
export function applyReaction(
  data: MessagesCache,
  payload:
    | MessageReactionPayload
    | { chatId: string; messageId: string; userId: string; emoji: string | null },
): MessagesCache {
  if ('stanzaId' in payload) {
    return mapMessages(data, (m) => {
      if (m.stanzaId !== payload.stanzaId) return m;
      const filtered = m.reactions.filter((r) => r.userId !== payload.senderJid);
      const next = payload.removed
        ? filtered
        : [...filtered, { userId: payload.senderJid, emoji: payload.emoji }];
      return { ...m, reactions: next };
    });
  }
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
