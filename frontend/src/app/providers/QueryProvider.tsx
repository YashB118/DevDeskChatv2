import { useState, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Defaults per FRONTEND_ARCHITECTURE.md §5.1 — socket-driven sync means the
 * cache should not refetch on focus/reconnect; staleness is determined by
 * the real-time stream, not by time.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: Infinity,
        gcTime: 30 * 60 * 1000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

interface QueryProviderProps {
  children: ReactNode;
  client?: QueryClient;
}

export function QueryProvider({ children, client }: QueryProviderProps): ReactElement {
  const [defaultClient] = useState(() => makeQueryClient());
  const queryClient = client ?? defaultClient;
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
