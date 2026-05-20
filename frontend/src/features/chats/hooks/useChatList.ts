import { useEffect, useMemo, useRef } from 'react';
import {
  useInfiniteQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { keys } from '@/shared/state/queryKeys';
import { readSnapshot, writeSnapshot } from '@/lib/storage/persistence.service';
import { chatsApi } from '../api/chats.api';
import {
  ChatListPageSchema,
  type ChatDTO,
  type ChatListPage,
} from '../types';
import { useChatsUIStore } from '../store/chats.store';
import { z } from 'zod';

const PERSIST_KEY = 'chats:list:firstPage';

const PersistedSnapshotSchema = z.object({
  filters: z.unknown(),
  page: ChatListPageSchema,
});

export function useChatList(): {
  chats: readonly ChatDTO[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
} {
  const filters = useChatsUIStore((s) => s.filters);
  const queryClient = useQueryClient();
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    void (async () => {
      const snap = await readSnapshot(PERSIST_KEY, PersistedSnapshotSchema);
      if (!snap) return;
      const key = keys.chats(filters);
      if (queryClient.getQueryData(key) !== undefined) return;
      queryClient.setQueryData<InfiniteData<ChatListPage>>(key, {
        pages: [snap.page],
        pageParams: [null],
      });
    })();
  }, [filters, queryClient]);

  const query = useInfiniteQuery({
    queryKey: keys.chats(filters),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => chatsApi.list({ filters, cursor: pageParam }),
    getNextPageParam: (last) => last.nextCursor,
  });

  useEffect(() => {
    const first = query.data?.pages[0];
    if (!first) return;
    writeSnapshot(PERSIST_KEY, { filters, page: first });
  }, [filters, query.data]);

  const chats = useMemo(() => {
    return (query.data?.pages ?? []).flatMap((p) => p.items);
  }, [query.data]);

  return {
    chats,
    isLoading: query.isLoading,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    fetchNextPage: () => {
      void query.fetchNextPage();
    },
  };
}

export function useFilteredSearchedChats(): readonly ChatDTO[] {
  const { chats } = useChatList();
  const search = useChatsUIStore((s) => s.search).trim().toLowerCase();
  return useMemo(() => {
    if (!search) return chats;
    return chats.filter((c) => {
      if (c.title.toLowerCase().includes(search)) return true;
      const preview = c.lastMessage?.preview.toLowerCase();
      return preview ? preview.includes(search) : false;
    });
  }, [chats, search]);
}
