import type { ReactElement } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { Badge } from '@/design-system/primitives/Badge';
import { Spinner } from '@/design-system/primitives/Spinner';
import { EmptyState } from '@/design-system/compounds/EmptyState';
import { SectionHeader } from '@/design-system/compounds/SectionHeader';
import { useFeedback } from '../../hooks/useFeedback';

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function FeedbackPanel(): ReactElement {
  const {
    items,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    markRead,
  } = useFeedback();

  if (isLoading) return <div className="flex justify-center p-12"><Spinner aria-label="Loading feedback" /></div>;
  if (isError) return <EmptyState title="Failed to load feedback" />;

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader title="Feedback" description="Developer feedback submitted via the dashboard." />
      {items.length === 0 ? (
        <EmptyState title="No feedback yet" />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((f) => (
            <li
              key={f.id}
              className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{f.authorName}</span>
                  {!f.read && <Badge tone="accent">New</Badge>}
                </div>
                <time className="text-[length:var(--text-xs)] text-[var(--color-fg-muted)]">
                  {formatTs(f.ts)}
                </time>
              </div>
              <p className="whitespace-pre-wrap text-[length:var(--text-sm)]">{f.message}</p>
              {!f.read && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      void markRead(f.id);
                    }}
                  >
                    Mark read
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            onClick={() => {
              fetchNextPage();
            }}
            isLoading={isFetchingNextPage}
            disabled={isFetchingNextPage}
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
