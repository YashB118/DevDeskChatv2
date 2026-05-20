import { useEffect, type ReactElement, type ReactNode } from 'react';
import {
  clearRefreshHandler,
  registerRefreshHandler,
} from '@/lib/http/retry';
import { clearAccessToken, setAccessToken } from '@/lib/storage/memory';
import { eventBus } from '@/realtime/eventBus';
import { authApi } from '../api/auth.api';
import { useBootstrapAuth } from '../hooks/useBootstrapAuth';
import { resetAuthState } from '../store/auth.store';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps): ReactElement {
  useEffect(() => {
    registerRefreshHandler(async () => {
      try {
        const { accessToken } = await authApi.refresh();
        setAccessToken(accessToken);
        return accessToken;
      } catch (err) {
        clearAccessToken();
        resetAuthState();
        eventBus.emit('auth:logged-out', { reason: 'refresh-failed' });
        throw err;
      }
    });
    return () => {
      clearRefreshHandler();
    };
  }, []);

  useBootstrapAuth();

  return <>{children}</>;
}
