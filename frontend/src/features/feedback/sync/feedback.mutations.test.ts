import { describe, it, expect } from 'vitest';
import type { InfiniteData } from '@tanstack/react-query';
import { applyFeedbackNew, applyRead } from './feedback.mutations';
import type { FeedbackDTO, FeedbackList } from '../types';

function item(over: Partial<FeedbackDTO> = {}): FeedbackDTO {
  return {
    id: 'f-1',
    userId: 'u-1',
    body: 'great',
    read: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function cache(items: FeedbackDTO[]): InfiniteData<FeedbackList> {
  return { pages: [{ items, nextCursor: null }], pageParams: [null] };
}

describe('feedback mutations', () => {
  it('applyRead marks the matching item read', () => {
    const next = applyRead(cache([item({ id: 'f-1' }), item({ id: 'f-2' })]), 'f-2');
    expect(next!.pages[0]!.items[0]!.read).toBe(false);
    expect(next!.pages[0]!.items[1]!.read).toBe(true);
  });

  it('applyFeedbackNew prepends a fresh item', () => {
    const next = applyFeedbackNew(cache([item({ id: 'f-1' })]), item({ id: 'f-new' }));
    expect(next!.pages[0]!.items[0]!.id).toBe('f-new');
    expect(next!.pages[0]!.items[1]!.id).toBe('f-1');
  });

  it('applyFeedbackNew is a no-op when already present', () => {
    const data = cache([item({ id: 'f-1' })]);
    const next = applyFeedbackNew(data, item({ id: 'f-1' }));
    expect(next).toBe(data);
  });
});
