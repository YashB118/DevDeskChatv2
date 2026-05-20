import { useMemo, type ReactElement } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { EmptyState } from '@/design-system/compounds/EmptyState';
import { Spinner } from '@/design-system/primitives/Spinner';
import { toChatId } from '@/shared/types/ids';
import { useChatList, useFilteredSearchedChats } from '../../hooks/useChatList';
import { useChatsUIStore } from '../../store/chats.store';
import type { ChatDTO } from '../../types';
import { ChatListItem } from '../ChatListItem/ChatListItem';

function applyClientFilters(chats: readonly ChatDTO[], filters: ReturnType<typeof useChatsUIStore.getState>['filters']): readonly ChatDTO[] {
  return chats.filter((c) => {
    if (filters.unreadOnly && c.unreadCount === 0) return false;
    if (filters.hideMuted && c.muted) return false;
    if (!filters.kinds.includes(c.kind)) return false;
    return true;
  });
}

export function ChatList(): ReactElement {
  const { isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage } = useChatList();
  const chats = useFilteredSearchedChats();
  const filters = useChatsUIStore((s) => s.filters);
  const activeChatId = useChatsUIStore((s) => s.activeChatId);

  const visible = useMemo(() => applyClientFilters(chats, filters), [chats, filters]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Spinner aria-label="Loading chats" />
      </div>
    );
  }
  if (isError) {
    return (
      <EmptyState
        title="Could not load chats"
        description="Check your connection and try again."
      />
    );
  }
  if (visible.length === 0) {
    return (
      <EmptyState
        title="No chats match"
        description="Adjust your filters or wait for new conversations."
      />
    );
  }

  return (
    <Virtuoso
      data={visible}
      computeItemKey={(_idx, chat) => chat.id}
      endReached={() => {
        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
      }}
      itemContent={(_idx, chat) => (
        <div className="px-2 py-0.5">
          <ChatListItem
            chat={chat}
            isActive={activeChatId !== null && activeChatId === toChatId(chat.id)}
          />
        </div>
      )}
      components={{
        Footer: () =>
          isFetchingNextPage ? (
            <div className="flex justify-center py-3">
              <Spinner aria-label="Loading more chats" />
            </div>
          ) : null,
      }}
    />
  );
}
