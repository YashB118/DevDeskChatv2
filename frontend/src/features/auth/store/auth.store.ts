import { useSyncExternalStore } from 'react';
import type { User } from '../types';

export type AuthStatus = 'initializing' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  user: User | null;
  error: string | null;
}

let state: AuthState = {
  status: 'initializing',
  user: null,
  error: null,
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function getAuthState(): AuthState {
  return state;
}

export function setAuthState(patch: Partial<AuthState>): void {
  state = { ...state, ...patch };
  emit();
}

export function resetAuthState(): void {
  state = { status: 'unauthenticated', user: null, error: null };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAuthState(): AuthState {
  return useSyncExternalStore(subscribe, getAuthState, getAuthState);
}
