import type { ReactElement } from 'react';
import { useConnectionStatusStore } from './connectionStatusStore';

const COPY: Record<string, string> = {
  connecting: 'Connecting…',
  reconnecting: 'Reconnecting…',
  offline: 'Offline — retrying when network returns',
};

export function ConnectionBanner(): ReactElement | null {
  const status = useConnectionStatusStore((s) => s.status);
  if (status === 'connected' || status === 'idle') return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-status={status}
      className="border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-sunken)] px-4 py-2 text-center text-[length:var(--text-sm)] text-[var(--color-fg-muted)]"
    >
      {COPY[status] ?? status}
    </div>
  );
}
