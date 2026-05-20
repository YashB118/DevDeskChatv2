import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useEffect } from 'react';
import { eventBus } from '@/realtime/eventBus';
import { useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '../api/sessions.api';
import type { SessionQR } from '../types';

/**
 * QR query enabled only when status is SCAN_QR_CODE. Refetches when
 * `sessions:status` for this session flips to SCAN_QR_CODE (WAHA rotates QRs).
 */
export function useSessionQR(name: string, enabled: boolean): UseQueryResult<SessionQR> {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ['sessions', name, 'qr'] as const,
    queryFn: () => sessionsApi.qr(name),
    enabled,
    staleTime: 30_000,
    gcTime: 60_000,
  });

  useEffect(() => {
    const handler = (payload: { name: string; status: string }): void => {
      if (payload.name !== name) return;
      if (payload.status === 'SCAN_QR_CODE') {
        void qc.invalidateQueries({ queryKey: ['sessions', name, 'qr'] });
      }
    };
    eventBus.on('sessions:status', handler);
    return () => {
      eventBus.off('sessions:status', handler);
    };
  }, [name, qc]);

  return query;
}
