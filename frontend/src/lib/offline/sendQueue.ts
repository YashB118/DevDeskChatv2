import { subscribeConnectivity } from './connectivity';

const MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = [500, 1000, 2000, 5000, 10000];

export interface QueuedSend<T = unknown> {
  id: string;
  enqueuedAt: number;
  attempts: number;
  task: () => Promise<T>;
}

type Listener = (size: number) => void;

const queue: QueuedSend[] = [];
const listeners = new Set<Listener>();
let retryTimer: ReturnType<typeof setTimeout> | null = null;

// Bind once at module load.
subscribeConnectivity((online) => {
  if (online) void flushSendQueue();
});

function notify(): void {
  for (const l of listeners) l(queue.length);
}

function scheduleRetry(attempt: number): void {
  if (retryTimer !== null) return;
  const delay = RETRY_BACKOFF_MS[Math.min(attempt - 1, RETRY_BACKOFF_MS.length - 1)] ?? 10000;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void flushSendQueue();
  }, delay);
}

export function enqueueSend<T>(task: () => Promise<T>): QueuedSend<T> {
  const id = `q-${String(Date.now())}-${String(Math.random()).slice(2, 8)}`;
  const item: QueuedSend<T> = { id, enqueuedAt: Date.now(), attempts: 0, task };
  queue.push(item);
  notify();
  return item;
}

export async function flushSendQueue(): Promise<void> {
  while (queue.length > 0) {
    const next = queue[0];
    if (!next) break;
    next.attempts += 1;
    try {
      await next.task();
      queue.shift();
      notify();
    } catch {
      if (next.attempts >= MAX_ATTEMPTS) {
        // Give up on this task — drop it so the queue doesn't wedge behind a
        // permanently failing send. The optimistic row stays in `failed` state.
        queue.shift();
        notify();
        continue;
      }
      // Transient error: don't busy-loop; back off and try again. The
      // connectivity listener will also nudge a flush on online events.
      scheduleRetry(next.attempts);
      return;
    }
  }
}

export function getSendQueueSize(): number {
  return queue.length;
}

export function subscribeSendQueue(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function _resetSendQueue(): void {
  queue.length = 0;
  listeners.clear();
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}
