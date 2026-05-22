import { useMemo, useRef, type ReactElement } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { EmptyState } from '@/design-system/compounds/EmptyState';
import { Spinner } from '@/design-system/primitives/Spinner';
import type { ChatId } from '@/shared/types/ids';
import { useCurrentUserId } from '@/shared/state/currentUser';
import { useMessages } from '../../hooks/useMessages';
import { useReactToMessage } from '../../hooks/useMessageMutations';
import { useMessagesUIStore } from '../../store/messages.store';
import type { MessageDTO } from '../../types';
import { MessageBubble } from '../MessageBubble/MessageBubble';

interface MessageListProps {
  chatId: ChatId;
  session: string;
}

function dayKey(ts: number): string {
  return new Date(ts).toDateString();
}

type Row =
  | { kind: 'divider'; key: string; label: string }
  | { kind: 'message'; key: string; message: MessageDTO };

function buildRows(messages: readonly MessageDTO[]): Row[] {
  const rows: Row[] = [];
  let lastDay: string | null = null;
  for (const m of messages) {
    const day = dayKey(m.ts);
    if (day !== lastDay) {
      rows.push({ kind: 'divider', key: `d-${day}`, label: day });
      lastDay = day;
    }
    rows.push({ kind: 'message', key: m.id, message: m });
  }
  return rows;
}

export function MessageList({ chatId, session }: MessageListProps): ReactElement {
  const { messages, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useMessages(chatId, session);
  const userId = useCurrentUserId();
  const { react } = useReactToMessage(chatId, session);
  const search = useMessagesUIStore((s) => s.search[chatId] ?? '');
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  const rows = useMemo(() => buildRows(messages), [messages]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Spinner aria-label="Loading messages" />
      </div>
    );
  }
  if (isError) {
    return <EmptyState title="Could not load messages" description="Try again later." />;
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No messages yet"
        description="Send the first message in this conversation."
      />
    );
  }

  return (
    <Virtuoso
      ref={virtuosoRef}
      data={rows}
      computeItemKey={(_idx, row) => row.key}
      followOutput="auto"
      initialTopMostItemIndex={rows.length - 1}
      startReached={() => {
        if (hasNextPage && !isFetchingNextPage) fetchNextPage();
      }}
      itemContent={(_idx, row) => {
        if (row.kind === 'divider') {
          return (
            <div className="my-3 flex items-center justify-center">
              <span className="rounded-[var(--radius-full)] bg-[var(--color-bg-elevated)] px-2 py-0.5 text-[length:var(--text-xs)] text-[var(--color-fg-muted)]">
                {row.label}
              </span>
            </div>
          );
        }
        return (
          <div className="flex flex-col px-4 py-1">
            <MessageBubble
              message={row.message}
              currentUserId={userId}
              highlight={search}
              onReact={(emoji) => {
                if (emoji === null) return;
                void react(row.message.stanzaId, emoji);
              }}
            />
          </div>
        );
      }}
      components={{
        Header: () =>
          isFetchingNextPage ? (
            <div className="flex justify-center py-2">
              <Spinner aria-label="Loading older messages" />
            </div>
          ) : null,
      }}
    />
  );
}
