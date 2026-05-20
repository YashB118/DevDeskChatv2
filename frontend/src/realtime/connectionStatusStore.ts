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
    { set((prev) => ({
      status,
      lastError: lastError === undefined ? prev.lastError : lastError,
    })); },
  setAttempt: (attempt) => { set({ attempt }); },
  reset: () => { set({ status: 'idle', attempt: 0, lastError: null }); },
}));
