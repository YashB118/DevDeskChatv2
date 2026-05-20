import { useEffect, type ReactNode } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AppSocket } from './socket';
import { useSocket } from './useSocket';

export type SyncHandler = (socket: AppSocket, queryClient: QueryClient) => () => void;

const registry: SyncHandler[] = [];

/**
 * Feature sync handlers register themselves at module load time. The
 * `SyncController` invokes each one when the socket is available and tears
 * them down on socket teardown.
 *
 * Phase 7+ populate this registry from each feature's `index.ts` import side
 * effect (via `registerChatsSync(...)` etc.).
 */
export function registerSyncHandler(handler: SyncHandler): void {
  registry.push(handler);
}

export function _getRegistry(): readonly SyncHandler[] {
  return registry;
}

export function _resetRegistry(): void {
  registry.length = 0;
}

interface SyncControllerProps {
  children?: ReactNode;
}

export function SyncController({ children }: SyncControllerProps): ReactNode {
  const socket = useSocket();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket) return;
    const teardown = registry.map((register) => register(socket, queryClient));
    return () => {
      for (const t of teardown) t();
    };
  }, [socket, queryClient]);

  return children ?? null;
}
