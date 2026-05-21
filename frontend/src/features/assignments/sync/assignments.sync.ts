import type { QueryClient, InfiniteData } from '@tanstack/react-query';
import type { AppSocket } from '@/realtime/socket';
import {
  ChatAssignmentSchema,
  ChatUnassignmentSchema,
  type ChatAssignmentPayload,
  type ChatUnassignmentPayload,
} from '@/realtime/events.contract';
import { keys } from '@/shared/state/queryKeys';
import type { AssignmentList } from '../types';
import { applyAssigned, applyUnassigned } from './assignments.mutations';

type Cache = InfiniteData<AssignmentList>;
type AnyListener = (...args: unknown[]) => void;

function updateAll(qc: QueryClient, fn: (data: Cache | undefined) => Cache | undefined): void {
  const entries = qc.getQueriesData<Cache>({ queryKey: keys.assignments() });
  for (const [key, data] of entries) {
    qc.setQueryData<Cache>(key, fn(data));
  }
}

export function registerAssignmentsSync(socket: AppSocket, qc: QueryClient): () => void {
  const onAssigned = (raw: unknown): void => {
    const parsed = ChatAssignmentSchema.safeParse(raw);
    if (!parsed.success) return;
    const payload: ChatAssignmentPayload = parsed.data;
    updateAll(qc, (data) => applyAssigned(data, payload));
  };
  const onUnassigned = (raw: unknown): void => {
    const parsed = ChatUnassignmentSchema.safeParse(raw);
    if (!parsed.success) return;
    const payload: ChatUnassignmentPayload = parsed.data;
    updateAll(qc, (data) => applyUnassigned(data, payload));
  };

  const on = socket.on.bind(socket) as (e: string, l: AnyListener) => void;
  const off = socket.off.bind(socket) as (e: string, l: AnyListener) => void;
  on('chat:assigned', onAssigned);
  on('chat:unassigned', onUnassigned);
  return () => {
    off('chat:assigned', onAssigned);
    off('chat:unassigned', onUnassigned);
  };
}
