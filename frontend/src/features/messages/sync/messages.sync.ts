import type { QueryClient } from '@tanstack/react-query';
import type { AppSocket } from '@/realtime/socket';
import {
  MessageAckSchema,
  MessageDeletedSchema,
  MessageEditedSchema,
  MessageNewSchema,
  MessageReactionSchema,
  type MessageAckPayload,
  type MessageDeletedPayload,
  type MessageEditedPayload,
  type MessageNewPayload,
  type MessageReactionPayload,
} from '@/realtime/events.contract';
import { keys } from '@/shared/state/queryKeys';
import { toChatId } from '@/shared/types/ids';
import {
  applyAck,
  applyDelete,
  applyEdit,
  applyMessageNew,
  applyReaction,
  type MessagesCache,
} from '../optimistic';

function updateChatMessages(
  qc: QueryClient,
  chatId: string,
  fn: (data: MessagesCache) => MessagesCache,
): void {
  qc.setQueryData<MessagesCache>(keys.messages(toChatId(chatId)), fn);
}

function makeListener<T>(
  schema: { safeParse: (raw: unknown) => { success: true; data: T } | { success: false } },
  handle: (payload: T) => void,
): (raw: unknown) => void {
  return (raw: unknown): void => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return;
    handle(parsed.data);
  };
}

export function registerMessagesSync(socket: AppSocket, qc: QueryClient): () => void {
  const onNew = makeListener<MessageNewPayload>(MessageNewSchema, (payload) => {
    updateChatMessages(qc, payload.chatId, (data) => applyMessageNew(data, payload));
  });
  const onAck = makeListener<MessageAckPayload>(MessageAckSchema, (payload) => {
    updateChatMessages(qc, payload.chatId, (data) => applyAck(data, payload));
  });
  const onEdited = makeListener<MessageEditedPayload>(MessageEditedSchema, (payload) => {
    updateChatMessages(qc, payload.chatId, (data) => applyEdit(data, payload));
  });
  const onDeleted = makeListener<MessageDeletedPayload>(MessageDeletedSchema, (payload) => {
    updateChatMessages(qc, payload.chatId, (data) => applyDelete(data, payload));
  });
  const onReaction = makeListener<MessageReactionPayload>(MessageReactionSchema, (payload) => {
    updateChatMessages(qc, payload.chatId, (data) => applyReaction(data, payload));
  });

  type AnyListener = (...args: unknown[]) => void;
  const on = socket.on.bind(socket) as (e: string, l: AnyListener) => void;
  const off = socket.off.bind(socket) as (e: string, l: AnyListener) => void;

  on('message:new', onNew);
  on('message:ack', onAck);
  on('message:edited', onEdited);
  on('message:deleted', onDeleted);
  on('message:reaction', onReaction);

  return () => {
    off('message:new', onNew);
    off('message:ack', onAck);
    off('message:edited', onEdited);
    off('message:deleted', onDeleted);
    off('message:reaction', onReaction);
  };
}
