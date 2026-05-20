import mitt, { type Emitter } from 'mitt';
import type { UserId } from '@/shared/types/ids';
import type {
  SessionStatusPayload,
  UserUpdatedPayload,
  FeedbackNewPayload,
} from './events.contract';

export interface AuthReadyPayload {
  userId: UserId;
}

export interface AuthLoggedOutPayload {
  reason: 'manual' | 'refresh-failed' | 'forced';
}

export interface SyncResumePayload {
  reason?: 'reconnect' | 'manual';
}

export interface AppErrorPayload {
  message: string;
  cause?: unknown;
}

// mitt requires `Record<EventType, unknown>`, which an `interface` cannot satisfy
// without an explicit index signature — using a type alias preserves narrow types.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type AppEvents = {
  'auth:ready': AuthReadyPayload;
  'auth:logged-out': AuthLoggedOutPayload;
  'sync:resume': SyncResumePayload;
  'app:error': AppErrorPayload;
  'sessions:status': SessionStatusPayload;
  'users:updated': UserUpdatedPayload;
  'feedback:new': FeedbackNewPayload;
};

export const eventBus: Emitter<AppEvents> = mitt<AppEvents>();
