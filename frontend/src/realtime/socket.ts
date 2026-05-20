import { io, type Socket } from 'socket.io-client';
import { env } from '@/lib/env';
import { getAccessToken } from '@/lib/storage/memory';
import { RECONNECT_CONFIG } from './reconnect';

export type AppSocket = Socket;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  socket ??= io(env.VITE_SOCKET_URL, {
    transports: ['websocket'],
    autoConnect: false,
    withCredentials: true,
    auth: (cb: (data: { token: string | null }) => void) => {
      cb({ token: getAccessToken() });
    },
    ...RECONNECT_CONFIG,
  });
  return socket;
}

export function disposeSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export function _setSocketForTests(s: AppSocket | null): void {
  socket = s;
}
