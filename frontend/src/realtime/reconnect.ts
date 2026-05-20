/**
 * Reconnect tuning. Socket.IO's native manager handles backoff; we just
 * configure it. Cap at 30s per FRONTEND_ARCHITECTURE.md §13 / plan Phase 5.
 */
export const RECONNECT_CONFIG = {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 500,
  reconnectionDelayMax: 30_000,
  randomizationFactor: 0.5,
  timeout: 20_000,
} as const;
