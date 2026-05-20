# Module: Realtime Event Bus (`realtime/eventBus`)

> A typed cross-feature pub/sub. First piece of `src/realtime/` to land; the rest of the realtime layer (socket singleton, sync controller, reconnect strategy) follows in Phase 5.

**Status:** Phase 3 — bus and four canonical events shipped. Additional event names land alongside their producers in Phase 5+ (socket connection state, `sync:resume` triggers, etc.).

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
| `frontend/src/realtime/index.ts` | Currently empty (intentional barrel placeholder). Phase 5 will re-export the socket and bus surface here. |

## Event map

```ts
type AppEvents = {
  'auth:ready': { userId: UserId };
  'auth:logged-out': { reason: 'manual' | 'refresh-failed' | 'forced' };
  'sync:resume': { reason?: 'reconnect' | 'manual' };
  'app:error': { message: string; cause?: unknown };
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
| `auth:logged-out` | `features/auth/components/AuthProvider.tsx` (refresh failure), `features/auth/hooks/useAuth.ts` (manual logout) | Immediately after the local token + state are cleared. |
| `sync:resume` | (not yet — Phase 5 reconnect handler) | After a socket reconnect, before per-feature sync handlers re-register. |
| `app:error` | (not yet — Phase 11 Sentry adapter, or the existing `AppErrorBoundary` `app:error` DOM event may consolidate here) | Unhandled rejection / boundary trip. |

## Consumers (planned)

| Phase | Consumer | Event |
|---|---|---|
| 5 | `SocketProvider` | `auth:ready` → open connection; `auth:logged-out` → close connection. |
| 5 | `SyncController` reconnect path | `sync:resume` → call each feature's resume handler. |
| 5+ | Per-feature sync modules | Optionally subscribe to `auth:logged-out` to clear feature-scoped caches. |
| 9 | Admin panel layout | `auth:logged-out` → exit any open admin tools. |
| 11 | Sentry adapter | `app:error` → breadcrumb / report. |

## Why bus events and not just hooks?

`useAuth().status === 'authenticated'` is the right primitive for "render this UI when logged in." The bus is for **transitions** — code that needs to fire exactly once when the state changes (open a socket, play a sound, post a beacon). Reading the store from React handles the steady-state question; subscribing to the bus handles the edge.

Do not move steady-state checks into the bus. Do not move one-shot transitions into the store.

## Cross-module wiring

| Outbound (events read by) | Module |
|---|---|
| `auth:ready` | (Phase 5) Socket provider |
| `auth:logged-out` | (Phase 5) Socket provider, (Phase 9) admin layout |

| Inbound (events emitted by) | Module |
|---|---|
| `auth:ready`, `auth:logged-out` | `features/auth` |

## Testing

The bus itself has no dedicated tests in Phase 3 — `mitt` is a tested library, and our wrapper adds only type information. Producer behavior is covered indirectly:

- `LoginForm.test.tsx` succeeds → `useAuth().login` emits `auth:ready` (not asserted, but the test mock-handler chain depends on it for `onSuccess`).
- `lib/http/client.test.ts` refresh-failure path: the AuthProvider would normally emit `auth:logged-out`; this is exercised end-to-end by manually rejecting the refresh handler.

When Phase 5 lands, add tests that:
1. Subscribe a spy to `auth:ready` and verify the socket opens.
2. Emit `auth:logged-out` and verify the socket closes.

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
- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 3 (current), Phase 5 (full realtime).
- Auth feature: [`auth.md`](auth.md).
- Master context: [`../context.md`](../context.md).
