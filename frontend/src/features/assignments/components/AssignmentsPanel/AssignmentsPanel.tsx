import { useMemo, type ReactElement } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { Button } from '@/design-system/primitives/Button';
import { Spinner } from '@/design-system/primitives/Spinner';
import { EmptyState } from '@/design-system/compounds/EmptyState';
import { SectionHeader } from '@/design-system/compounds/SectionHeader';
import { useToast } from '@/design-system/primitives/Toast';
import { AppApiError } from '@/lib/http/errors';
import { toChatId, toUserId } from '@/shared/types/ids';
import { useDirectory } from '@/lib/data/useDirectory';
import { useAssignmentActions, useAssignments } from '../../hooks/useAssignments';

export function AssignmentsPanel(): ReactElement {
  const {
    items,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useAssignments();
  const { data: directory } = useDirectory();
  const { assign, unassign } = useAssignmentActions();
  const { push } = useToast();

  const developers = useMemo(
    () => (directory?.users ?? []).filter((u) => !u.disabled),
    [directory],
  );

  const handle = async (label: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
      push({ title: `${label} succeeded`, description: undefined, tone: 'success' });
    } catch (err) {
      const msg = AppApiError.isAppApiError(err) ? err.message : `${label} failed`;
      push({ title: `${label} failed`, description: msg, tone: 'danger' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner aria-label="Loading assignments" />
      </div>
    );
  }
  if (isError) return <EmptyState title="Failed to load assignments" />;

  return (
    <div className="flex h-full flex-col gap-4">
      <SectionHeader
        title="Assignments"
        description="Reassign or unassign chats across developers."
      />
      {items.length === 0 ? (
        <EmptyState title="No chats" description="Once chats arrive, you can assign them here." />
      ) : (
        <Virtuoso
          style={{ height: 600 }}
          data={items}
          computeItemKey={(_, item) => item.chatId}
          endReached={() => {
            if (hasNextPage && !isFetchingNextPage) fetchNextPage();
          }}
          itemContent={(_, a) => (
            <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border-subtle)] p-3">
              <div className="flex flex-col">
                <span className="font-medium">{a.chatTitle}</span>
                <span className="text-[length:var(--text-sm)] text-[var(--color-fg-muted)]">
                  {a.assignedToName ?? 'Unassigned'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <select
                  aria-label={`Assign ${a.chatTitle}`}
                  className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-canvas)] px-2 text-[length:var(--text-sm)]"
                  value={a.assignedTo ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') {
                      void handle('Unassign', () => unassign(toChatId(a.chatId)));
                    } else {
                      void handle('Assign', () =>
                        assign(toChatId(a.chatId), toUserId(v)),
                      );
                    }
                  }}
                >
                  <option value="">Unassigned</option>
                  {developers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.displayName}
                    </option>
                  ))}
                </select>
                {a.assignedTo && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void handle('Unassign', () => unassign(toChatId(a.chatId)))}
                  >
                    Unassign
                  </Button>
                )}
              </div>
            </div>
          )}
          components={{
            Footer: () =>
              isFetchingNextPage ? (
                <div className="flex justify-center p-3">
                  <Spinner aria-label="Loading more" />
                </div>
              ) : null,
          }}
        />
      )}
    </div>
  );
}
