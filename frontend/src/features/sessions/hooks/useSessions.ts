import { useCallback } from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { keys } from '@/shared/state/queryKeys';
import { sessionsApi } from '../api/sessions.api';
import type { CreateSessionInput, SessionList } from '../types';

export function useSessions(): UseQueryResult<SessionList> {
  return useQuery({
    queryKey: keys.sessions(),
    queryFn: () => sessionsApi.list(),
  });
}

export interface UseSessionMutationsReturn {
  create: (input: CreateSessionInput) => Promise<void>;
  start: (name: string) => Promise<void>;
  stop: (name: string) => Promise<void>;
  remove: (name: string) => Promise<void>;
  isMutating: boolean;
}

export function useSessionMutations(): UseSessionMutationsReturn {
  const qc = useQueryClient();

  const refetch = (): Promise<void> => qc.invalidateQueries({ queryKey: keys.sessions() }).then(() => undefined);

  const createMut = useMutation({
    mutationFn: (input: CreateSessionInput) => sessionsApi.create(input),
    onSuccess: refetch,
  });
  const startMut = useMutation({
    mutationFn: (name: string) => sessionsApi.start(name),
    onSuccess: refetch,
  });
  const stopMut = useMutation({
    mutationFn: (name: string) => sessionsApi.stop(name),
    onSuccess: refetch,
  });
  const removeMut = useMutation({
    mutationFn: (name: string) => sessionsApi.remove(name),
    onSuccess: refetch,
  });

  const create = useCallback(
    async (input: CreateSessionInput) => {
      await createMut.mutateAsync(input);
    },
    [createMut],
  );
  const start = useCallback(
    async (name: string) => {
      await startMut.mutateAsync(name);
    },
    [startMut],
  );
  const stop = useCallback(
    async (name: string) => {
      await stopMut.mutateAsync(name);
    },
    [stopMut],
  );
  const remove = useCallback(
    async (name: string) => {
      await removeMut.mutateAsync(name);
    },
    [removeMut],
  );

  return {
    create,
    start,
    stop,
    remove,
    isMutating:
      createMut.isPending || startMut.isPending || stopMut.isPending || removeMut.isPending,
  };
}
