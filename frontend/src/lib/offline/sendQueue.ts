import { subscribeConnectivity } from './connectivity';

export interface QueuedSend<T = unknown> {
  id: string;
  enqueuedAt: number;
  attempts: number;
  task: () => Promise<T>;
}

type Listener = (size: number) => void;

const queue: QueuedSend[] = [];
const listeners = new Set<Listener>();

// Bind once at module load.
subscribeConnectivity((online) => {
  if (online) void flushSendQueue();
});

function notify(): void {
  for (const l of listeners) l(queue.length);
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
      // stop on first failure; retry on next online event
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
}
