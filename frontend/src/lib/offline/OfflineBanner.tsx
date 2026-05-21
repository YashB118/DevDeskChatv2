import { useEffect, useState, type ReactElement } from 'react';
import { useConnectivityStore } from './connectivity';
import { getSendQueueSize, subscribeSendQueue } from './sendQueue';

export function OfflineBanner(): ReactElement | null {
  const online = useConnectivityStore((s) => s.online);
  const [queued, setQueued] = useState<number>(() => getSendQueueSize());

  useEffect(() => {
    return subscribeSendQueue(setQueued);
  }, []);

  if (online && queued === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-[var(--color-border-subtle)] bg-[var(--color-warning)] px-4 py-1 text-[length:var(--text-sm)] text-[var(--color-warning-fg)]"
    >
      {!online ? (
        <span>You&apos;re offline. Messages will send when you reconnect.</span>
      ) : (
        <span>Reconnected — flushing {String(queued)} queued send{queued === 1 ? '' : 's'}.</span>
      )}
    </div>
  );
}
