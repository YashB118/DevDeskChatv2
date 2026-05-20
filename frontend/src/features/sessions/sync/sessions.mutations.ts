import type { SessionStatusPayload } from '@/realtime/events.contract';
import type { SessionList } from '../types';

export function applySessionStatus(
  data: SessionList | undefined,
  payload: SessionStatusPayload,
): SessionList | undefined {
  if (!data) return data;
  const next = data.sessions.map((s) =>
    s.name === payload.name ? { ...s, status: payload.status, updatedAt: new Date().toISOString() } : s,
  );
  return { sessions: next };
}
