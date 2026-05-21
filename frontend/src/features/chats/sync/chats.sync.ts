import type { QueryClient, InfiniteData } from '@tanstack/react-query';
import type { AppSocket } from '@/realtime/socket';
import {
  ChatAssignedSchema,
  ChatMutedSchema,
  ChatReadSchema,
  ChatUnassignedSchema,
  MessageNewSchema,
  type ChatAssignedPayload,
  type ChatMutedPayload,
  type ChatReadPayload,
  type ChatUnassignedPayload,
  type MessageNewPayload,
} from '@/realtime/events.contract';
import { keys } from '@/shared/state/queryKeys';
import { eventBus } from '@/realtime/eventBus';
import type { ChatListPage } from '../types';
import {
  applyAssigned,
  applyMuted,
  applyRead,
  applyUnassigned,
  bumpChatWithMessage,
} from './chats.mutations';

type ChatsCache = InfiniteData<ChatListPage>;

function updateAllChatLists(qc: QueryClient, fn: (data: ChatsCache | undefined) => ChatsCache | undefined): void {
  const entries = qc.getQueriesData<ChatsCache>({ queryKey: ['chats'] });
  for (const [key, data] of entries) {
    qc.setQueryData<ChatsCache>(key, fn(data));
  }
}

function makeListener<T>(schema: { safeParse: (raw: unknown) => { success: true; data: T } | { success: false } }, handle: (payload: T) => void): (raw: unknown) => void {
  return (raw: unknown): void => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return;
    handle(parsed.data);
  };
}

export function registerChatsSync(socket: AppSocket, qc: QueryClient): () => void {
  const onMessageNew = makeListener<MessageNewPayload>(MessageNewSchema, (payload) => {
    updateAllChatLists(qc, (data) => bumpChatWithMessage(data, payload));
    if (!payload.preview.fromSelf) {
      eventBus.emit('message:received', payload);
    }
  });
  const onAssigned = makeListener<ChatAssignedPayload>(ChatAssignedSchema, (payload) => {
    updateAllChatLists(qc, (data) => applyAssigned(data, payload));
    void qc.invalidateQueries({ queryKey: keys.assignments() });
  });
  const onUnassigned = makeListener<ChatUnassignedPayload>(ChatUnassignedSchema, (payload) => {
    updateAllChatLists(qc, (data) => applyUnassigned(data, payload));
    void qc.invalidateQueries({ queryKey: keys.assignments() });
  });
  const onRead = makeListener<ChatReadPayload>(ChatReadSchema, (payload) => {
    updateAllChatLists(qc, (data) => applyRead(data, payload));
  });
  const onMuted = makeListener<ChatMutedPayload>(ChatMutedSchema, (payload) => {
    updateAllChatLists(qc, (data) => applyMuted(data, payload));
  });

  type AnyListener = (...args: unknown[]) => void;
  const on = socket.on.bind(socket) as (e: string, l: AnyListener) => void;
  const off = socket.off.bind(socket) as (e: string, l: AnyListener) => void;

  on('message:new', onMessageNew);
  on('chat:assigned', onAssigned);
  on('chat:unassigned', onUnassigned);
  on('chat:read', onRead);
  on('chat:muted', onMuted);

  return () => {
    off('message:new', onMessageNew);
    off('chat:assigned', onAssigned);
    off('chat:unassigned', onUnassigned);
    off('chat:read', onRead);
    off('chat:muted', onMuted);
  };
}
