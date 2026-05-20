import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/tests/mocks/server';
import { env } from '@/lib/env';
import { useGlobalMute, useGlobalMuteActions } from './useGlobalMute';

function wrapper(client: QueryClient): (props: { children: ReactNode }) => ReactElement {
  return function Wrapper({ children }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  server.resetHandlers();
});

describe('useGlobalMute', () => {
  it('optimistically flips then rolls back on failure', async () => {
    server.use(
      http.get(`${env.VITE_API_BASE_URL}/api/mute/global`, () =>
        HttpResponse.json({ muted: false }),
      ),
      http.patch(`${env.VITE_API_BASE_URL}/api/mute/global`, () =>
        HttpResponse.json({ error: { code: 'ERR' } }, { status: 500 }),
      ),
    );

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: 0 }, mutations: { retry: 0 } },
    });
    const get = renderHook(() => useGlobalMute(), { wrapper: wrapper(qc) });
    const actions = renderHook(() => useGlobalMuteActions(), { wrapper: wrapper(qc) });

    await waitFor(() => {
      expect(get.result.current.data?.muted).toBe(false);
    });
    await expect(actions.result.current.setMuted(true)).rejects.toBeDefined();
    await waitFor(() => {
      expect(get.result.current.data?.muted).toBe(false);
    });
  });
});
