import { useCallback } from 'react';
import { AppApiError } from '@/lib/http/errors';
import { clearAccessToken, setAccessToken } from '@/lib/storage/memory';
import { clearAllPersistedData } from '@/lib/storage/persistence.service';
import { eventBus } from '@/realtime/eventBus';
import { useCurrentUserStore } from '@/shared/state/currentUser';
import { toUserId } from '@/shared/types/ids';
import { authApi } from '../api/auth.api';
import {
  resetAuthState,
  setAuthState,
  useAuthState,
  type AuthStatus,
} from '../store/auth.store';
import type { LoginInput, PasswordChangeInput, User } from '../types';

export interface UseAuthReturn {
  status: AuthStatus;
  user: User | null;
  error: string | null;
  isAuthenticated: boolean;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (input: PasswordChangeInput) => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const state = useAuthState();

  const login = useCallback(async (input: LoginInput): Promise<void> => {
    try {
      const res = await authApi.login(input);
      setAccessToken(res.accessToken);
      setAuthState({ status: 'authenticated', user: res.user, error: null });
      useCurrentUserStore.getState().setUser({ id: res.user.id, displayName: res.user.displayName });
      eventBus.emit('auth:ready', { userId: toUserId(res.user.id) });
    } catch (err) {
      const message = AppApiError.isAppApiError(err) ? err.message : 'Login failed';
      setAuthState({ status: 'unauthenticated', user: null, error: message });
      throw err;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await authApi.logout();
    } catch {
      // swallow — local cleanup is the priority
    }
    clearAccessToken();
    resetAuthState();
    useCurrentUserStore.getState().setUser(null);
    await clearAllPersistedData();
    eventBus.emit('auth:logged-out', { reason: 'manual' });
  }, []);

  const changePassword = useCallback(async (input: PasswordChangeInput): Promise<void> => {
    await authApi.changePassword(input);
  }, []);

  return {
    status: state.status,
    user: state.user,
    error: state.error,
    isAuthenticated: state.status === 'authenticated' && state.user !== null,
    login,
    logout,
    changePassword,
  };
}
