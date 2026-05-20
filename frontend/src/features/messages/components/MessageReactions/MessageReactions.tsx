import { useMemo, type ReactElement } from 'react';
import type { Reaction } from '../../types';

interface MessageReactionsProps {
  reactions: readonly Reaction[];
  currentUserId: string | null;
  onToggle: (emoji: string | null) => void;
}

export function MessageReactions({
  reactions,
  currentUserId,
  onToggle,
}: MessageReactionsProps): ReactElement | null {
  const counts = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    for (const r of reactions) {
      const cur = map.get(r.emoji) ?? { count: 0, mine: false };
      cur.count += 1;
      if (currentUserId && r.userId === currentUserId) cur.mine = true;
      map.set(r.emoji, cur);
    }
    return [...map.entries()];
  }, [reactions, currentUserId]);

  if (counts.length === 0) return null;

  return (
    <div role="group" aria-label="Reactions" className="mt-1 flex flex-wrap gap-1">
      {counts.map(([emoji, { count, mine }]) => (
        <button
          key={emoji}
          type="button"
          data-mine={mine || undefined}
          aria-pressed={mine}
          onClick={() => {
            onToggle(mine ? null : emoji);
          }}
          className="inline-flex items-center gap-1 rounded-[var(--radius-full)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-canvas)] px-2 py-0.5 text-[length:var(--text-xs)] data-[mine]:border-[var(--color-accent)] data-[mine]:bg-[var(--color-accent)]/10"
        >
          <span aria-hidden>{emoji}</span>
          <span className="tabular-nums text-[var(--color-fg-muted)]">{count}</span>
        </button>
      ))}
    </div>
  );
}
