import { apiClient } from '@/lib/http/client';
import type { ChatId } from '@/shared/types/ids';
import {
  BackendMessageListResponseSchema,
  type BackendMessageResponse,
  type MessageDTO,
  type MessagePage,
  type MessageType,
  type SendMessageInput,
  type SendMessageResponse,
} from '../types';

const MESSAGE_TYPE_FALLBACK: MessageType = 'TEXT';
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
  return KNOWN_TYPES.has(upper as MessageType) ? (upper as MessageType) : MESSAGE_TYPE_FALLBACK;
}

function isoToMs(iso: string): number {
  const ts = Date.parse(iso);
  return Number.isFinite(ts) ? ts : 0;
}

/**
 * Adapts the backend `MessageResponse` (stanzaId/fromJid/ISO dates) to the
 * frontend `MessageDTO` (senderId/numeric ms). Until the backend ships a
 * dedicated `deletedAt` and `editedAt` on the message row, we derive them
 * from `deleted` + `edits[]`.
 */
function adaptMessage(r: BackendMessageResponse): MessageDTO {
  const latestEdit = r.edits[0];
  const lastReaction = r.reactions[r.reactions.length - 1];
  return {
    id: r.id,
    stanzaId: r.stanzaId,
    chatId: r.chatId,
    senderId: r.fromJid,
    body: r.body ?? '',
    type: coerceType(r.type),
    ts: isoToMs(r.sentAt),
    editedAt: latestEdit ? isoToMs(latestEdit.editedAt) : null,
    deletedAt: r.deleted
      ? lastReaction
        ? isoToMs(lastReaction.createdAt)
        : isoToMs(r.sentAt)
      : null,
    reactions: r.reactions.map((x) => ({ emoji: x.emoji, userId: x.senderJid })),
    quoted: r.quote
      ? { messageId: r.quote.quotedStanzaId, authorId: '', preview: r.quote.quotedBody ?? '' }
      : null,
    forwarded: false,
    media: null,
    status: 'confirmed',
  };
}

export const messagesApi = {
  async list(
    chatId: ChatId,
    session: string,
    cursor?: string | null,
    limit = 50,
  ): Promise<MessagePage> {
    const params: Record<string, string | number> = { limit, session };
    if (cursor) params.beforeStanzaId = cursor;
    const res = await apiClient.get<unknown>(`/api/messages/${chatId}`, { params });
    const parsed = BackendMessageListResponseSchema.parse(res.data);
    // Backend returns DESC (newest-first). Reverse so each page is ordered
    // oldest→newest, which is what the renderer and `appendOptimistic` expect.
    // The next-page (older) cursor is the OLDEST stanzaId on this page —
    // i.e. the last element of the DESC response, *before* reversing.
    const oldest = parsed.messages[parsed.messages.length - 1];
    const reversed = [...parsed.messages].reverse();
    return {
      items: reversed.map(adaptMessage),
      nextCursor: parsed.messages.length >= limit && oldest ? oldest.stanzaId : null,
    };
  },

  async send(
    chatId: ChatId,
    session: string,
    input: SendMessageInput,
  ): Promise<SendMessageResponse> {
    const body: Record<string, unknown> = { session, text: input.body };
    if (input.quoted?.messageId) body.quotedStanzaId = input.quoted.messageId;
    if (input.mentions && input.mentions.length > 0) body.mentions = [...input.mentions];
    const res = await apiClient.post<SendMessageResponse>(`/api/messages/${chatId}/send`, body);
    return res.data;
  },

  async edit(chatId: ChatId, stanzaId: string, session: string, text: string): Promise<void> {
    await apiClient.patch(`/api/messages/${chatId}/${stanzaId}`, { session, text });
  },

  async delete(chatId: ChatId, stanzaId: string, session: string): Promise<void> {
    await apiClient.delete(`/api/messages/${chatId}/${stanzaId}`, { data: { session } });
  },

  async react(
    chatId: ChatId,
    stanzaId: string,
    session: string,
    emoji: string,
  ): Promise<{ removed: boolean }> {
    const res = await apiClient.post<{ removed: boolean }>(
      `/api/messages/${chatId}/${stanzaId}/react`,
      { session, emoji },
    );
    return res.data;
  },

  async forward(
    chatId: ChatId,
    stanzaId: string,
    session: string,
    toChatId: ChatId,
  ): Promise<{ stanzaId: string }> {
    const res = await apiClient.post<{ stanzaId: string }>(
      `/api/messages/${chatId}/${stanzaId}/forward`,
      { session, toChatId },
    );
    return res.data;
  },

  async participants(chatId: ChatId): Promise<readonly { id: string; name: string }[]> {
    const res = await apiClient.get<{ items: { id: string; name: string }[] }>(
      `/api/chats/${chatId}/participants`,
    );
    return res.data.items;
  },
};
