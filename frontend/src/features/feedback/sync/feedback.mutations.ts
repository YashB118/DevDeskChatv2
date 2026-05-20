import type { InfiniteData } from '@tanstack/react-query';
import type { FeedbackDTO, FeedbackList } from '../types';

type Pages = InfiniteData<FeedbackList> | undefined;

export function applyRead(data: Pages, id: string): Pages {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((p) => ({
      ...p,
      items: p.items.map((f: FeedbackDTO) => (f.id === id ? { ...f, read: true } : f)),
    })),
  };
}

export function applyFeedbackNew(data: Pages, item: FeedbackDTO): Pages {
  if (!data) return data;
  const first = data.pages[0];
  if (!first) return data;
  const exists = data.pages.some((p) => p.items.some((f) => f.id === item.id));
  if (exists) return data;
  return {
    ...data,
    pages: [{ ...first, items: [item, ...first.items] }, ...data.pages.slice(1)],
  };
}
