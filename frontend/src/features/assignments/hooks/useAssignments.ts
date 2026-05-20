import { useCallback, useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { keys } from '@/shared/state/queryKeys';
import type { ChatId, UserId } from '@/shared/types/ids';
import { assignmentsApi } from '../api/assignments.api';
import type { AssignmentDTO, AssignmentList } from '../types';
import { applyAssigned, applyUnassigned } from '../sync/assignments.mutations';

type Cache = InfiniteData<AssignmentList>;

export interface UseAssignmentsReturn {
  items: readonly AssignmentDTO[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
}

export function useAssignments(): UseAssignmentsReturn {
  const query = useInfiniteQuery({
    queryKey: keys.assignments(),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => assignmentsApi.list({ cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor,
  });

  const items = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.items), [query.data]);

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
  };
}

export interface UseAssignmentActionsReturn {
  assign: (chatId: ChatId, userId: UserId) => Promise<void>;
  unassign: (chatId: ChatId) => Promise<void>;
}

export function useAssignmentActions(): UseAssignmentActionsReturn {
  const qc = useQueryClient();

  const snapshot = (): readonly [readonly unknown[], Cache | undefined][] =>
    qc.getQueriesData<Cache>({ queryKey: keys.assignments() });

  const assignMut = useMutation({
    mutationFn: ({ chatId, userId }: { chatId: ChatId; userId: UserId }) =>
      assignmentsApi.assign(chatId, userId),
    onMutate: ({ chatId, userId }) => {
      const snaps = snapshot();
      for (const [key, data] of snaps) {
        qc.setQueryData<Cache>(key, applyAssigned(data, { chatId, assignedTo: userId }));
      }
      return { snaps };
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return;
      for (const [key, data] of ctx.snaps) qc.setQueryData(key, data);
    },
  });

  const unassignMut = useMutation({
    mutationFn: (chatId: ChatId) => assignmentsApi.unassign(chatId),
    onMutate: (chatId) => {
      const snaps = snapshot();
      for (const [key, data] of snaps) {
        qc.setQueryData<Cache>(key, applyUnassigned(data, { chatId }));
      }
      return { snaps };
    },
    onError: (_e, _v, ctx) => {
      if (!ctx) return;
      for (const [key, data] of ctx.snaps) qc.setQueryData(key, data);
    },
  });

  const assign = useCallback(
    async (chatId: ChatId, userId: UserId) => {
      await assignMut.mutateAsync({ chatId, userId });
    },
    [assignMut],
  );
  const unassign = useCallback(
    async (chatId: ChatId) => {
      await unassignMut.mutateAsync(chatId);
    },
    [unassignMut],
  );

  return { assign, unassign };
}
