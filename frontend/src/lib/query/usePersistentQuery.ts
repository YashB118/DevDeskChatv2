import { useEffect, useRef } from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { ZodTypeAny, z } from 'zod';
import { readSnapshot, writeSnapshot } from '@/lib/storage/persistence.service';

interface PersistentQueryOptions<Schema extends ZodTypeAny, TData = z.infer<Schema>>
  extends Omit<UseQueryOptions<TData, Error, TData>, 'queryKey' | 'queryFn'> {
  queryKey: QueryKey;
  queryFn: () => Promise<TData>;
  /** Key under which the snapshot is stored in IndexedDB. */
  persistenceKey: string;
  /** Schema applied to the persisted payload on read. */
  schema: Schema;
}

/**
 * `useQuery` wrapper that primes the cache from IndexedDB on mount and
 * writes successful network results back. Stale snapshots are dropped
 * silently — the network response is the source of truth.
 */
export function usePersistentQuery<Schema extends ZodTypeAny, TData = z.infer<Schema>>(
  options: PersistentQueryOptions<Schema, TData>,
): UseQueryResult<TData> {
  const { persistenceKey, schema, queryKey, queryFn, ...rest } = options;
  const queryClient = useQueryClient();
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    const cancelled = { value: false };
    void (async () => {
      const cached = await readSnapshot(persistenceKey, schema);
      if (cancelled.value) return;
      if (cached !== null && queryClient.getQueryData(queryKey) === undefined) {
        queryClient.setQueryData(queryKey, cached);
      }
    })();

    return () => {
      cancelled.value = true;
    };
  }, [persistenceKey, schema, queryKey, queryClient]);

  const result = useQuery<TData, Error, TData>({
    queryKey,
    queryFn,
    ...rest,
  });

  useEffect(() => {
    if (result.isSuccess && result.data !== undefined) {
      writeSnapshot(persistenceKey, result.data);
    }
  }, [persistenceKey, result.isSuccess, result.data]);

  return result;
}
