# Module: Realtime Event Bus (`realtime/eventBus`)

> A typed cross-feature pub/sub. Documented separately from the rest of `realtime/` ([`realtime.md`](realtime.md)) because every feature touches it.

**Status:** Through Phase 10 — bus + nine event names shipped.

---

## Purpose

Cross-feature signals that aren't cache mutations should not pass through TanStack Query, Zustand, or the Socket.IO client directly — that tangles features together. The event bus is the small, typed channel where producers fire-and-forget and consumers subscribe per-event.

Today (Phase 3), the bus's job is auth lifecycle:

- `AuthProvider` emits `auth:ready` after successful silent refresh or login, so the future `SocketProvider` (Phase 5) knows when to open the WebSocket.
- `AuthProvider` and `useAuth().logout()` emit `auth:logged-out` with a reason, so the socket can close and any feature that cached "current user" data can clear it.

`sync:resume` and `app:error` are placeholders for Phase 5 (reconnect) and Phase 11 (error telemetry); they are declared now so producers and consumers can agree on the type surface.

## Files

| Path | Role |
|---|---|
| `frontend/src/realtime/eventBus.ts` | The single `mitt` emitter, the `AppEvents` map, and per-event payload interfaces. |
| `frontend/src/realtime/index.ts` | Re-exports `eventBus`, socket surface, `useSocket`, `useSocketEvent`, `SyncController`, `registerSyncHandler`, `connectionStatusStore`, `ConnectionBanner`, and the contract types. |

## Event map

```ts
type AppEvents = {
  'auth:ready': { userId: UserId };
  'auth:logged-out': { reason: 'manual' | 'refresh-failed' | 'forced' };
  'sync:resume': { reason?: 'reconnect' | 'manual' };
  'app:error': { message: string; cause?: unknown };
  'sessions:status': SessionStatusPayload;     // re-fanned from session:status socket event
  'users:updated': UserUpdatedPayload;
  'feedback:new': FeedbackNewPayload;
  'message:received': MessageNewPayload;       // fanned out by chats.sync when !fromSelf — notifications hook
};
```

Each payload is a named interface (`AuthReadyPayload`, `AuthLoggedOutPayload`, `SyncResumePayload`, `AppErrorPayload`) so consumers can type their handlers. The `AppEvents` map itself is a `type` (not `interface`) — `mitt`'s `Emitter<T>` constrains `T extends Record<EventType, unknown>` and TypeScript does not consider an interface assignable to `Record<string, unknown>` without an index signature. The file pins an `// eslint-disable-next-line` comment explaining why; do not change it back.

## Why `mitt` and not something heavier?

- ~200 bytes minified.
- Strongly typed via the generic parameter.
- No subscribe-during-emit reordering footguns (handlers are called synchronously, in registration order).
- No internal scheduling — emit is just iterate handlers. Predictable in tests.

`mitt` does not provide once-only listeners. If a consumer needs "fire-once" semantics, wrap the handler:

```ts
const handler = (payload) => { eventBus.off('auth:ready', handler); /* ... */ };
eventBus.on('auth:ready', handler);
```

## Lifecycle and ordering

The bus is a module-level singleton — it exists for the lifetime of the page. Subscriptions added inside React components MUST be cleared on unmount (use `useEffect`'s cleanup):

```ts
useEffect(() => {
  const handler = (payload: AuthReadyPayload) => { /* ... */ };
  eventBus.on('auth:ready', handler);
  return () => { eventBus.off('auth:ready', handler); };
}, []);
```

Events emitted before a handler subscribes are dropped (no replay). The contract is: if you depend on a one-shot event like `auth:ready`, also read the relevant store on mount as a fallback — `useAuth().status === 'authenticated'` is the canonical fallback for "session is live."

## Producers (current)

| Event | Producer | When |
|---|---|---|
| `auth:ready` | `features/auth/components/AuthProvider.tsx` (silent refresh success), `features/auth/hooks/useAuth.ts` (login success) | After token + user are in memory; payload carries `toUserId(user.id)`. |
| `auth:logged-out` | `features/auth/components/AuthProvider.tsx` (refresh failure), `features/auth/hooks/useAuth.ts` (manual logout) | After local token + state cleared. |
| `sync:resume` | `realtime/SocketContext.tsx` on manager reconnect | After socket reconnects; future per-feature resume hooks fan out from here. |
| `app:error` | `realtime/useSocketEvent.ts` in prod on Zod failure | Bad inbound payload (instead of throwing). Phase 11 Sentry adapter will subscribe. |
| `sessions:status` | `features/sessions/sync/sessions.sync.ts` after Zod-validated `session:status` arrives | Fans out so `useSessionQR` knows when to refetch the QR. |
| `users:updated` · `feedback:new` | Declared payload types — not currently emitted by client code (re-fan via socket sync handlers if needed). | Reserved for future per-feature fan-out. |
| `message:received` | `features/chats/sync/chats.sync.ts` when `message:new` payload `!fromSelf` | Decouples cache updates from notification logic. |

## Consumers (current)

| Consumer | Event |
|---|---|
| `realtime/SocketContext.tsx` | `auth:ready` → open socket; `auth:logged-out` → close socket. |
| `features/notifications/notification.service.ts` (via `NotificationController`) | `message:received` → run `shouldNotify` gate + outputs. |
| `features/sessions/hooks/useSessionQR.ts` | `sessions:status` → invalidate the QR query when status flips to `SCAN_QR_CODE`. |

## Why bus events and not just hooks?

`useAuth().status === 'authenticated'` is the right primitive for "render this UI when logged in." The bus is for **transitions** — code that needs to fire exactly once when the state changes (open a socket, play a sound, post a beacon). Reading the store from React handles the steady-state question; subscribing to the bus handles the edge.

Do not move steady-state checks into the bus. Do not move one-shot transitions into the store.

## Cross-module wiring

See producer / consumer tables above for the full picture. Notable cross-feature edges:

- `features/auth` emits `auth:ready` / `auth:logged-out`; `realtime/SocketContext` consumes both.
- `features/chats` re-emits `message:new` as `message:received` for the notifications subsystem.
- `features/sessions` re-emits `session:status` as `sessions:status` for in-feature consumers (`useSessionQR`).

## Testing

- `SocketContext.test.tsx` exercises producer ↔ consumer end-to-end (`auth:ready` opens socket, `auth:logged-out` closes it, manager reconnect emits `sync:resume`).
- `notification.service.test.ts` verifies `eventBus.emit('message:received')` triggers gated outputs.
- The bus itself has no dedicated tests — `mitt` is a tested library; wrapper adds only types.

## How to extend

| Need | What to do |
|---|---|
| Add a new event name | Add a payload interface (or use an existing one), then add the entry to `AppEvents`. Consumers and producers will type-check against the new key immediately. |
| Add an event with no payload | Use `void` or `Record<string, never>` — preferred: a small empty interface so future enrichment is non-breaking. |
| Subscribe from a non-React module | Import `eventBus`, call `eventBus.on(...)`. Remember to off-it during teardown if the module has a lifecycle. |
| Replay missed events | The bus doesn't replay. Read the relevant store on mount and subscribe for subsequent transitions. |
| Move from `mitt` to a different bus | Keep the `eventBus` named export and the `AppEvents` map; the rest of the app is decoupled from the implementation. |

## References

- Architecture: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §6.5 (event bus), §4 (boot sequence — the `auth:ready` gate).
- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 3 (auth events), Phase 5 (socket lifecycle + `sync:resume`), Phase 10 (`message:received` for notifications).
- Auth feature: [`auth.md`](auth.md). Realtime: [`realtime.md`](realtime.md). Notifications: [`notifications.md`](notifications.md).
- Master context: [`../context.md`](../context.md).
