import type { QueryClient, InfiniteData } from '@tanstack/react-query';
import type { AppSocket } from '@/realtime/socket';
import { FeedbackNewSchema } from '@/realtime/events.contract';
import { keys } from '@/shared/state/queryKeys';
import { feedbackApi } from '../api/feedback.api';
import type { FeedbackList } from '../types';

type Cache = InfiniteData<FeedbackList>;
type AnyListener = (...args: unknown[]) => void;

export function registerFeedbackSync(socket: AppSocket, qc: QueryClient): () => void {
  const onNew = (raw: unknown): void => {
    const parsed = FeedbackNewSchema.safeParse(raw);
    if (!parsed.success) return;
    // The payload only carries id+ts; refetch the first page to pick up the body.
    const cached = qc.getQueryData<Cache>(keys.feedback());
    if (!cached) return;
    void feedbackApi
      .list({ limit: 10 })
      .then((page) => {
        // Multiple `feedback:new` events can stack between fetches, so the
        // newest row may not be position 0. Locate by id instead of position.
        const fresh = page.items.find((f) => f.id === parsed.data.id);
        if (!fresh) return;
        qc.setQueryData<Cache>(keys.feedback(), (data) => {
          if (!data) return data;
          const exists = data.pages.some((p) => p.items.some((f) => f.id === fresh.id));
          if (exists) return data;
          const first = data.pages[0];
          if (!first) return data;
          return {
            ...data,
            pages: [{ ...first, items: [fresh, ...first.items] }, ...data.pages.slice(1)],
          };
        });
      })
      .catch(() => undefined);
  };

  const on = socket.on.bind(socket) as (e: string, l: AnyListener) => void;
  const off = socket.off.bind(socket) as (e: string, l: AnyListener) => void;
  on('feedback:new', onNew);
  return () => {
    off('feedback:new', onNew);
  };
}
