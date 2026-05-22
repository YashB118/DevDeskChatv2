import type { QueryClient, InfiniteData } from '@tanstack/react-query';
import type { AppSocket } from '@/realtime/socket';
import {
  ChatAssignmentSchema,
  ChatMutedSchema,
  ChatReadSchema,
  ChatUnassignmentSchema,
  GroupParticipantsSchema,
  MessageNewSchema,
  type ChatAssignmentPayload,
  type ChatMutedPayload,
  type ChatReadPayload,
  type ChatUnassignmentPayload,
  type GroupParticipantsPayload,
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
    if (!payload.message.fromMe) {
      eventBus.emit('message:received', payload);
    }
  });
  const onAssigned = makeListener<ChatAssignmentPayload>(ChatAssignmentSchema, (payload) => {
    updateAllChatLists(qc, (data) => applyAssigned(data, payload));
    void qc.invalidateQueries({ queryKey: keys.assignments() });
  });
  const onUnassigned = makeListener<ChatUnassignmentPayload>(ChatUnassignmentSchema, (payload) => {
    updateAllChatLists(qc, (data) => applyUnassigned(data, payload));
    void qc.invalidateQueries({ queryKey: keys.assignments() });
  });
  const onRead = makeListener<ChatReadPayload>(ChatReadSchema, (payload) => {
    updateAllChatLists(qc, (data) => applyRead(data, payload));
  });
  const onMuted = makeListener<ChatMutedPayload>(ChatMutedSchema, (payload) => {
    updateAllChatLists(qc, (data) => applyMuted(data, payload));
  });
  const onGroupParticipants = makeListener<GroupParticipantsPayload>(
    GroupParticipantsSchema,
    (payload) => {
      // Participants cache lands in Phase 6; for now just invalidate by key.
      void qc.invalidateQueries({ queryKey: keys.chatParticipants(payload.chatId) });
    },
  );

  type AnyListener = (...args: unknown[]) => void;
  const on = socket.on.bind(socket) as (e: string, l: AnyListener) => void;
  const off = socket.off.bind(socket) as (e: string, l: AnyListener) => void;

  on('message:new', onMessageNew);
  on('chat:assigned', onAssigned);
  on('chat:unassigned', onUnassigned);
  on('chat:read', onRead);
  on('chat:muted', onMuted);
  on('group:participants', onGroupParticipants);

  return () => {
    off('message:new', onMessageNew);
    off('chat:assigned', onAssigned);
    off('chat:unassigned', onUnassigned);
    off('chat:read', onRead);
    off('chat:muted', onMuted);
    off('group:participants', onGroupParticipants);
  };
}
