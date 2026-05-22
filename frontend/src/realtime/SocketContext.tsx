import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { disposeSocket, getSocket, type AppSocket } from './socket';
import { eventBus } from './eventBus';
import { useConnectionStatusStore } from './connectionStatusStore';

interface SocketContextValue {
  socket: AppSocket | null;
}

const SocketContext = createContext<SocketContextValue>({ socket: null });

interface SocketProviderProps {
  children: ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps): ReactElement {
  const [socket, setSocket] = useState<AppSocket | null>(null);
  const socketRef = useRef<AppSocket | null>(null);
  const teardownRef = useRef<(() => void) | null>(null);
  const { setStatus, setAttempt, reset } = useConnectionStatusStore.getState();

  useEffect(() => {
    function open(): void {
      if (socketRef.current) return;
      const s = getSocket();
      socketRef.current = s;

      const onConnect = (): void => {
        setStatus('connected', null);
        setAttempt(0);
      };
      const onDisconnect = (reason: string): void => {
        // 'io client disconnect' = local close, don't show reconnecting UI
        if (reason === 'io client disconnect') return;
        setStatus('reconnecting');
      };
      const onConnectError = (err: Error): void => {
        setStatus('reconnecting', err.message);
      };
      const onReconnectAttempt = (attempt: number): void => {
        setStatus('reconnecting');
        setAttempt(attempt);
      };
      const onReconnect = (): void => {
        setStatus('connected', null);
        setAttempt(0);
        eventBus.emit('sync:resume', { reason: 'reconnect' });
      };
      const onReconnectFailed = (): void => {
        setStatus('offline', 'reconnect attempts exhausted');
      };

      s.on('connect', onConnect);
      s.on('disconnect', onDisconnect);
      s.on('connect_error', onConnectError);
      s.io.on('reconnect_attempt', onReconnectAttempt);
      s.io.on('reconnect', onReconnect);
      s.io.on('reconnect_failed', onReconnectFailed);

      // Track each listener individually so logout → login cycles don't
      // accumulate stale handlers on the shared manager.
      teardownRef.current = () => {
        s.off('connect', onConnect);
        s.off('disconnect', onDisconnect);
        s.off('connect_error', onConnectError);
        s.io.off('reconnect_attempt', onReconnectAttempt);
        s.io.off('reconnect', onReconnect);
        s.io.off('reconnect_failed', onReconnectFailed);
      };

      setStatus('connecting', null);
      s.connect();
      setSocket(s);
    }

    function close(): void {
      teardownRef.current?.();
      teardownRef.current = null;
      setSocket(null);
      socketRef.current = null;
      disposeSocket();
      reset();
    }

    const onAuthReady = (): void => { open(); };
    const onLoggedOut = (): void => { close(); };

    eventBus.on('auth:ready', onAuthReady);
    eventBus.on('auth:logged-out', onLoggedOut);

    return () => {
      eventBus.off('auth:ready', onAuthReady);
      eventBus.off('auth:logged-out', onLoggedOut);
      close();
    };
  }, [setStatus, setAttempt, reset]);

  const value = useMemo<SocketContextValue>(() => ({ socket }), [socket]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocketContext(): SocketContextValue {
  return useContext(SocketContext);
}
