import type { QueryClient } from '@tanstack/react-query';
import type { AppSocket } from '@/realtime/socket';
import {
  SessionStatusSchema,
  type SessionStatusPayload,
} from '@/realtime/events.contract';
import { keys } from '@/shared/state/queryKeys';
import { eventBus } from '@/realtime/eventBus';
import { applySessionStatus } from './sessions.mutations';
import type { SessionList } from '../types';

type AnyListener = (...args: unknown[]) => void;

export function registerSessionsSync(socket: AppSocket, qc: QueryClient): () => void {
  const onStatus = (raw: unknown): void => {
    const parsed = SessionStatusSchema.safeParse(raw);
    if (!parsed.success) return;
    const payload: SessionStatusPayload = parsed.data;
    qc.setQueryData<SessionList>(keys.sessions(), (current) =>
      applySessionStatus(current, payload),
    );
    eventBus.emit('sessions:status', payload);
  };

  const on = socket.on.bind(socket) as (e: string, l: AnyListener) => void;
  const off = socket.off.bind(socket) as (e: string, l: AnyListener) => void;

  on('session:status', onStatus);
  return () => {
    off('session:status', onStatus);
  };
}
