import mitt, { type Emitter } from 'mitt';

 
type AnyEvents = Record<string, unknown>;

export interface FakeManager {
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  off: (event: string, cb: (...args: unknown[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
}

export interface FakeSocket {
  io: FakeManager;
  connect: () => void;
  disconnect: () => void;
  removeAllListeners: () => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  off: (event: string, cb: (...args: unknown[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
  connected: boolean;
  connectCalls: number;
  disconnectCalls: number;
  trigger: (event: string, ...args: unknown[]) => void;
  triggerManager: (event: string, ...args: unknown[]) => void;
}

export function createFakeSocket(): FakeSocket {
  const events: Emitter<AnyEvents> = mitt();
  const managerEvents: Emitter<AnyEvents> = mitt();

  const manager: FakeManager = {
    on: (e, cb) => { managerEvents.on(e, cb); },
    off: (e, cb) => { managerEvents.off(e, cb); },
    emit: (e, ...args) => { managerEvents.emit(e, args.length <= 1 ? args[0] : args); },
  };

  const socket: FakeSocket = {
    io: manager,
    connected: false,
    connectCalls: 0,
    disconnectCalls: 0,
    connect: () => {
      socket.connectCalls += 1;
    },
    disconnect: () => {
      socket.disconnectCalls += 1;
      socket.connected = false;
    },
    removeAllListeners: () => {
      events.all.clear();
      managerEvents.all.clear();
    },
    on: (e, cb) => { events.on(e, cb); },
    off: (e, cb) => { events.off(e, cb); },
    emit: (_e, ..._args) => {
      /* outbound emit — no-op for tests */
    },
    trigger: (e, ...args) => { events.emit(e, args.length <= 1 ? args[0] : args); },
    triggerManager: (e, ...args) => { managerEvents.emit(e, args.length <= 1 ? args[0] : args); },
  };

  return socket;
}
