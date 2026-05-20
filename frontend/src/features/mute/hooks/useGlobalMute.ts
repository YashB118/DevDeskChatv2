import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { muteApi } from '../api/mute.api';
import type { GlobalMute } from '../types';

const KEY = ['mute', 'global'] as const;

export function useGlobalMute(): UseQueryResult<GlobalMute> {
  return useQuery({
    queryKey: KEY,
    queryFn: () => muteApi.get(),
  });
}

export interface UseGlobalMuteActionsReturn {
  setMuted: (muted: boolean) => Promise<void>;
  isPending: boolean;
}

export function useGlobalMuteActions(): UseGlobalMuteActionsReturn {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (muted: boolean) => muteApi.set(muted),
    onMutate: (muted) => {
      const prev = qc.getQueryData<GlobalMute>(KEY);
      qc.setQueryData<GlobalMute>(KEY, { muted });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: KEY });
    },
  });
  const setMuted = useCallback(
    async (muted: boolean) => {
      await mut.mutateAsync(muted);
    },
    [mut],
  );
  return { setMuted, isPending: mut.isPending };
}
