import { useCallback, useMemo } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { keys } from '@/shared/state/queryKeys';
import { feedbackApi } from '../api/feedback.api';
import type { FeedbackDTO, FeedbackList } from '../types';
import { applyRead } from '../sync/feedback.mutations';

type Cache = InfiniteData<FeedbackList>;

export interface UseFeedbackReturn {
  items: readonly FeedbackDTO[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  markRead: (id: string) => Promise<void>;
}

export function useFeedback(): UseFeedbackReturn {
  const qc = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: keys.feedback(),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => feedbackApi.list({ cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor,
  });

  const items = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.items), [query.data]);

  const markReadMut = useMutation({
    mutationFn: (id: string) => feedbackApi.markRead(id),
    onMutate: (id) => {
      const prev = qc.getQueryData<Cache>(keys.feedback());
      qc.setQueryData<Cache>(keys.feedback(), applyRead(prev, id));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(keys.feedback(), ctx.prev);
    },
  });

  const markRead = useCallback(
    async (id: string) => {
      await markReadMut.mutateAsync(id);
    },
    [markReadMut],
  );

  return {
    items,
    isLoading: query.isLoading,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
    markRead,
  };
}
