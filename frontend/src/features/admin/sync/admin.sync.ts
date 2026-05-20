import type { QueryClient } from '@tanstack/react-query';
import type { AppSocket } from '@/realtime/socket';
import {
  UserUpdatedSchema,
  type UserUpdatedPayload,
} from '@/realtime/events.contract';
import { keys } from '@/shared/state/queryKeys';
import type { AdminUserList } from '../types';

type AnyListener = (...args: unknown[]) => void;

export function applyUserUpdated(
  data: AdminUserList | undefined,
  payload: UserUpdatedPayload,
): AdminUserList | undefined {
  if (!data) return data;
  return {
    users: data.users.map((u) =>
      u.id === payload.id
        ? {
            ...u,
            disabled: payload.disabled ?? u.disabled,
            role: payload.role ?? u.role,
          }
        : u,
    ),
  };
}

export function registerAdminSync(socket: AppSocket, qc: QueryClient): () => void {
  const onUserUpdated = (raw: unknown): void => {
    const parsed = UserUpdatedSchema.safeParse(raw);
    if (!parsed.success) return;
    qc.setQueryData<AdminUserList>(keys.users(), (current) =>
      applyUserUpdated(current, parsed.data),
    );
  };

  const on = socket.on.bind(socket) as (e: string, l: AnyListener) => void;
  const off = socket.off.bind(socket) as (e: string, l: AnyListener) => void;
  on('user:updated', onUserUpdated);
  return () => {
    off('user:updated', onUserUpdated);
  };
}
