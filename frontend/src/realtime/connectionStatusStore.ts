import { create } from 'zustand';

export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';

interface ConnectionStatusState {
  status: ConnectionStatus;
  attempt: number;
  lastError: string | null;
  setStatus: (status: ConnectionStatus, lastError?: string | null) => void;
  setAttempt: (attempt: number) => void;
  reset: () => void;
}

export const useConnectionStatusStore = create<ConnectionStatusState>((set) => ({
  status: 'idle',
  attempt: 0,
  lastError: null,
  setStatus: (status, lastError) =>
    {
      // Treat reaching a healthy state as a positive signal that clears stale
      // error text. Callers that need to keep the prior error must pass it in.
      const cleared = status === 'connected' || status === 'idle';
      set((prev) => ({
        status,
        lastError:
          lastError === undefined ? (cleared ? null : prev.lastError) : lastError,
      }));
    },
  setAttempt: (attempt) => { set({ attempt }); },
  reset: () => { set({ status: 'idle', attempt: 0, lastError: null }); },
}));
