import { useEffect, useRef } from 'react';
import { setAccessToken } from '@/lib/storage/memory';
import { eventBus } from '@/realtime/eventBus';
import { toUserId } from '@/shared/types/ids';
import { authApi } from '../api/auth.api';
import { resetAuthState, setAuthState } from '../store/auth.store';

export function useBootstrapAuth(): void {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      try {
        const { accessToken } = await authApi.refresh();
        setAccessToken(accessToken);
        const user = await authApi.me();
        setAuthState({ status: 'authenticated', user, error: null });
        eventBus.emit('auth:ready', { userId: toUserId(user.id) });
      } catch {
        resetAuthState();
      }
    })();
  }, []);
}
