import { useEffect, type ReactNode } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { AppSocket } from './socket';
import { useSocket } from './useSocket';
import { eventBus } from './eventBus';

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
    // On reconnect, the wire-event listeners are still attached but the
    // backend may have dropped state we missed. Refetch active queries so
    // chats/messages caches re-sync with reality.
    const onResume = (): void => {
      void queryClient.refetchQueries({ type: 'active' });
    };
    eventBus.on('sync:resume', onResume);
    return () => {
      eventBus.off('sync:resume', onResume);
      for (const t of teardown) t();
    };
  }, [socket, queryClient]);

  return children ?? null;
}
