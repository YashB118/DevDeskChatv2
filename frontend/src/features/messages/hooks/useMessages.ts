import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { keys } from '@/shared/state/queryKeys';
import type { ChatId } from '@/shared/types/ids';
import { messagesApi } from '../api/messages.api';
import type { MessageDTO } from '../types';

export function useMessages(chatId: ChatId): {
  messages: readonly MessageDTO[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
} {
  const query = useInfiniteQuery({
    queryKey: keys.messages(chatId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => messagesApi.list(chatId, pageParam),
    getNextPageParam: (last) => last.nextCursor,
  });

  const messages = useMemo(() => {
    return (query.data?.pages ?? []).flatMap((p) => p.items);
  }, [query.data]);

  return {
    messages,
    isLoading: query.isLoading,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
  };
}
