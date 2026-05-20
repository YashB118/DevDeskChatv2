export { eventBus } from './eventBus';
export type {
  AppEvents,
  AuthReadyPayload,
  AuthLoggedOutPayload,
  SyncResumePayload,
  AppErrorPayload,
} from './eventBus';
export { getSocket, disposeSocket, type AppSocket } from './socket';
export { SocketProvider, useSocketContext } from './SocketContext';
export { useSocket } from './useSocket';
export { useSocketEvent } from './useSocketEvent';
export {
  SyncController,
  registerSyncHandler,
  type SyncHandler,
} from './sync.controller';
export { useConnectionStatusStore, type ConnectionStatus } from './connectionStatusStore';
export { ConnectionBanner } from './ConnectionBanner';
export {
  InboundEvents,
  OutboundEvents,
  type InboundEventName,
  type InboundPayload,
  type OutboundEventName,
  type OutboundPayload,
} from './events.contract';
