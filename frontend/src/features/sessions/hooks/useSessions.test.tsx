import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/tests/mocks/server';
import { env } from '@/lib/env';
import { useSessions, useSessionMutations } from './useSessions';

function wrapper(client: QueryClient): (props: { children: ReactNode }) => ReactElement {
  return function Wrapper({ children }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  server.resetHandlers();
});

describe('useSessions', () => {
  it('lists sessions parsed via Zod', async () => {
    server.use(
      http.get(`${env.VITE_API_BASE_URL}/api/sessions`, () =>
        HttpResponse.json({
          sessions: [
            {
              id: 's-1',
              name: 'alpha',
              status: 'WORKING',
              config: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      ),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const { result } = renderHook(() => useSessions(), { wrapper: wrapper(qc) });

    await waitFor(() => {
      expect(result.current.data?.sessions[0]?.name).toBe('alpha');
    });
  });

  it('create invalidates the list', async () => {
    let listCount = 0;
    server.use(
      http.get(`${env.VITE_API_BASE_URL}/api/sessions`, () => {
        listCount += 1;
        return HttpResponse.json({ sessions: [] });
      }),
      http.post(`${env.VITE_API_BASE_URL}/api/sessions`, () =>
        HttpResponse.json(
          {
            id: 's-2',
            name: 'beta',
            status: 'STARTING',
            config: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          { status: 201 },
        ),
      ),
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: 0 } } });
    const list = renderHook(() => useSessions(), { wrapper: wrapper(qc) });
    const mut = renderHook(() => useSessionMutations(), { wrapper: wrapper(qc) });

    await waitFor(() => {
      expect(list.result.current.isSuccess).toBe(true);
    });
    const before = listCount;
    await mut.result.current.create({ name: 'beta' });
    await waitFor(() => {
      expect(listCount).toBeGreaterThan(before);
    });
  });
});
