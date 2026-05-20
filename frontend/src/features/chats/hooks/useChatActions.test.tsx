import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import {
  QueryClient,
  QueryClientProvider,
  type InfiniteData,
} from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/tests/mocks/server';
import { keys } from '@/shared/state/queryKeys';
import { toChatId } from '@/shared/types/ids';
import { env } from '@/lib/env';
import { useChatActions } from './useChatActions';
import type { ChatDTO, ChatListPage } from '../types';

type Cache = InfiniteData<ChatListPage>;

function wrapper(client: QueryClient): (props: { children: ReactNode }) => ReactElement {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function chat(over: Partial<ChatDTO> = {}): ChatDTO {
  return {
    id: 'c-1',
    kind: 'INDIVIDUAL',
    title: 'A',
    avatarUrl: null,
    unreadCount: 7,
    muted: false,
    pinned: false,
    assignedTo: null,
    sessionId: null,
    lastMessage: null,
    updatedAt: 0,
    ...over,
  };
}

function getCache(qc: QueryClient): Cache {
  const data = qc.getQueryData<Cache>(keys.chats({}));
  if (!data) throw new Error('cache not populated');
  return data;
}

beforeEach(() => {
  server.resetHandlers();
});

describe('useChatActions', () => {
  it('markRead optimistically zeroes unread and persists on success', async () => {
    server.use(
      http.post(`${env.VITE_API_BASE_URL}/api/chats/:chatId/read`, () =>
        HttpResponse.json({}, { status: 204 }),
      ),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    qc.setQueryData<Cache>(keys.chats({}), {
      pages: [{ items: [chat()], nextCursor: null }],
      pageParams: [null],
    });

    const { result } = renderHook(() => useChatActions(), { wrapper: wrapper(qc) });

    await result.current.markRead(toChatId('c-1'));

    const cache = getCache(qc);
    expect(cache.pages[0]?.items[0]?.unreadCount).toBe(0);
  });

  it('setMuted rolls back when the mutation fails', async () => {
    server.use(
      http.patch(`${env.VITE_API_BASE_URL}/api/chats/:chatId/mute`, () =>
        HttpResponse.json({ error: { code: 'ERR' } }, { status: 500 }),
      ),
    );

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
    });
    qc.setQueryData<Cache>(keys.chats({}), {
      pages: [{ items: [chat({ muted: false })], nextCursor: null }],
      pageParams: [null],
    });

    const { result } = renderHook(() => useChatActions(), { wrapper: wrapper(qc) });

    await expect(result.current.setMuted(toChatId('c-1'), true)).rejects.toBeDefined();

    await waitFor(() => {
      const cache = getCache(qc);
      expect(cache.pages[0]?.items[0]?.muted).toBe(false);
    });
  });
});
