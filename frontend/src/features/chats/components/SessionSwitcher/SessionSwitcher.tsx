import type { ReactElement } from 'react';
import { useChatsUIStore } from '../../store/chats.store';

/**
 * Placeholder UI until the sessions feature lands (Phase 9). Lets the user
 * scope chats to a specific session id; defaults to "All sessions".
 */
export function SessionSwitcher(): ReactElement {
  const sessionId = useChatsUIStore((s) => s.filters.sessionId);
  const setFilters = useChatsUIStore((s) => s.setFilters);

  return (
    <label className="flex flex-col gap-1 text-[length:var(--text-xs)] text-[var(--color-fg-muted)]">
      Session
      <select
        value={sessionId ?? ''}
        onChange={(e) => {
          setFilters({ sessionId: e.target.value || null });
        }}
        className="rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-bg-canvas)] px-2 py-1 text-[length:var(--text-sm)] text-[var(--color-fg-primary)]"
      >
        <option value="">All sessions</option>
      </select>
    </label>
  );
}
