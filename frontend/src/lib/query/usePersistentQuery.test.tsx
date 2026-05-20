import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { z } from 'zod';
import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { deleteDatabase, _resetForTests } from '@/lib/storage/indexedDB';
import {
  _flushAllForTests,
  flushSnapshot,
  readSnapshot,
} from '@/lib/storage/persistence.service';
import { usePersistentQuery } from './usePersistentQuery';

const ItemSchema = z.object({ id: z.string(), value: z.number() });
type Item = z.infer<typeof ItemSchema>;

function wrapper(client: QueryClient): (props: { children: ReactNode }) => ReactElement {
  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function Harness({ fetchFn }: { fetchFn: () => Promise<Item> }): ReactElement {
  const { data } = usePersistentQuery({
    queryKey: ['item'],
    queryFn: fetchFn,
    persistenceKey: 'item-snap',
    schema: ItemSchema,
  });
  return <div data-testid="value">{data ? `${data.id}:${data.value}` : 'empty'}</div>;
}

beforeEach(async () => {
  _flushAllForTests();
  await deleteDatabase();
  _resetForTests();
});

describe('usePersistentQuery', () => {
  it('hydrates from IndexedDB before the network resolves', async () => {
    await flushSnapshot('item-snap', { id: 'a', value: 1 });

    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: 0 } },
    });
    let resolve!: (v: Item) => void;
    const fetchFn = (): Promise<Item> =>
      new Promise<Item>((res) => {
        resolve = res;
      });

    render(<Harness fetchFn={fetchFn} />, { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(screen.getByTestId('value').textContent).toBe('a:1');
    });

    act(() => {
      resolve({ id: 'a', value: 2 });
    });

    await waitFor(() => {
      expect(screen.getByTestId('value').textContent).toBe('a:2');
    });
  });

  it('writes successful network results back into IndexedDB', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: 0 } },
    });
    const fetchFn = (): Promise<Item> => Promise.resolve({ id: 'b', value: 9 });

    render(<Harness fetchFn={fetchFn} />, { wrapper: wrapper(client) });

    await waitFor(() => {
      expect(screen.getByTestId('value').textContent).toBe('b:9');
    });

    await new Promise((r) => setTimeout(r, 600));
    const persisted = await readSnapshot('item-snap', ItemSchema);
    expect(persisted).toEqual({ id: 'b', value: 9 });
  });
});
