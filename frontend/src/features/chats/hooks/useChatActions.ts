import { useCallback } from 'react';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { keys } from '@/shared/state/queryKeys';
import type { ChatId, UserId } from '@/shared/types/ids';
import { chatsApi } from '../api/chats.api';
import { applyMuted, applyRead } from '../sync/chats.mutations';
import type { ChatListPage } from '../types';

type Cache = InfiniteData<ChatListPage>;

function updateAllChatLists(
  qc: ReturnType<typeof useQueryClient>,
  fn: (data: Cache | undefined) => Cache | undefined,
): [readonly unknown[], Cache | undefined][] {
  const entries = qc.getQueriesData<Cache>({ queryKey: ['chats'] });
  const snapshots: [readonly unknown[], Cache | undefined][] = [];
  for (const [key, data] of entries) {
    snapshots.push([key, data]);
    qc.setQueryData<Cache>(key, fn(data));
  }
  return snapshots;
}

export interface UseChatActionsReturn {
  markRead: (chatId: ChatId) => Promise<void>;
  setMuted: (chatId: ChatId, muted: boolean) => Promise<void>;
  assign: (chatId: ChatId, userId: UserId | null) => Promise<void>;
}

export function useChatActions(): UseChatActionsReturn {
  const qc = useQueryClient();

  const markReadMutation = useMutation({
    mutationFn: (chatId: ChatId) => chatsApi.markRead(chatId),
    onMutate: (chatId) => {
      const snapshots = updateAllChatLists(qc, (data) => applyRead(data, { chatId, by: 'self' }));
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      for (const [key, data] of ctx.snapshots) qc.setQueryData(key, data);
    },
  });

  const muteMutation = useMutation({
    mutationFn: ({ chatId, muted }: { chatId: ChatId; muted: boolean }) =>
      chatsApi.setMuted(chatId, muted),
    onMutate: ({ chatId, muted }) => {
      const snapshots = updateAllChatLists(qc, (data) => applyMuted(data, { chatId, muted }));
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      for (const [key, data] of ctx.snapshots) qc.setQueryData(key, data);
    },
  });

  const assignMutation = useMutation({
    mutationFn: ({ chatId, userId }: { chatId: ChatId; userId: UserId | null }) =>
      chatsApi.assign(chatId, userId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.assignments() });
    },
  });

  const markRead = useCallback(
    async (chatId: ChatId) => {
      await markReadMutation.mutateAsync(chatId);
    },
    [markReadMutation],
  );
  const setMuted = useCallback(
    async (chatId: ChatId, muted: boolean) => {
      await muteMutation.mutateAsync({ chatId, muted });
    },
    [muteMutation],
  );
  const assign = useCallback(
    async (chatId: ChatId, userId: UserId | null) => {
      await assignMutation.mutateAsync({ chatId, userId });
    },
    [assignMutation],
  );

  return { markRead, setMuted, assign };
}
