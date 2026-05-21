import { create } from 'zustand';

type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();

interface ConnectivityState {
  online: boolean;
  setOnline: (online: boolean) => void;
}

export const useConnectivityStore = create<ConnectivityState>((set) => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  setOnline: (online) => {
    set({ online });
    for (const l of listeners) l(online);
  },
}));

export function subscribeConnectivity(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

let bound = false;
export function bindConnectivityListeners(): () => void {
  if (typeof window === 'undefined' || bound) return () => undefined;
  bound = true;
  const onOnline = (): void => {
    useConnectivityStore.getState().setOnline(true);
  };
  const onOffline = (): void => {
    useConnectivityStore.getState().setOnline(false);
  };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    bound = false;
  };
}
