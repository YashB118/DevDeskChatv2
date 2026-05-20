import { useSocketContext } from './SocketContext';
import type { AppSocket } from './socket';

export function useSocket(): AppSocket | null {
  return useSocketContext().socket;
}
