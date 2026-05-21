# Module: Realtime Core (`realtime/`)

> Single Socket.IO client above the router. Module-level singleton, typed event hook, sync handler registry, reconnect status, connection banner. Event bus already documented separately in [`realtime-event-bus.md`](realtime-event-bus.md).

**Status:** Phase 5 — complete. Sequence-resume endpoint deferred.

## Files

```
frontend/src/realtime/
├── socket.ts                  # getSocket() ??= singleton, disposeSocket()
├── SocketContext.tsx          # SocketProvider lifecycle (auth:ready open / auth:logged-out close)
├── useSocket.ts               # context reader
├── useSocketEvent.ts          # typed event subscribe + Zod payload gate
├── reconnect.ts               # RECONNECT_CONFIG (cap 30s)
├── connectionStatusStore.ts   # Zustand: idle | connecting | connected | reconnecting | offline
├── ConnectionBanner.tsx       # status surface for layouts
├── sync.controller.ts         # SyncController + registerSyncHandler registry
├── events.contract.ts         # Zod inbound/outbound schemas (mirror of backend)
├── eventBus.ts                # mitt-backed cross-feature signals
├── __test-utils__/            # stub socket for SocketProvider tests
└── index.ts                   # public exports
```

## Socket singleton

```ts
export function getSocket(): AppSocket;     // creates once with transports: ['websocket'], autoConnect: false,
                                            //   withCredentials: true, auth: cb => cb({ token: getAccessToken() })
export function disposeSocket(): void;      // close + null the singleton (used on logout/teardown)
```

`auth` is a callback so reconnects always pick up the freshly-rotated token rather than a captured stale one.

## `SocketProvider` lifecycle

Mounted in `AppProviders` ABOVE `<AppRouter />`.

- On `eventBus.on('auth:ready')` → `socket.connect()`.
- On `eventBus.on('auth:logged-out')` → `socket.disconnect()` + `disposeSocket()`.
- Tracks `connect` / `disconnect` / `connect_error` (socket) and `reconnect_attempt` / `reconnect` / `reconnect_failed` (Manager) → updates `connectionStatusStore`.
- On successful manager reconnect → `eventBus.emit('sync:resume', { reason: 'reconnect' })`.
- Ignores local `'io client disconnect'` for the reconnecting status (manual disconnects are intentional).

## `useSocketEvent`

```ts
useSocketEvent('message:new', (payload) => { /* payload typed via OutboundEvents */ });
```

- Generic key constrained to `OutboundEventName`.
- Validates payload against `OutboundEvents[name]` via `safeParse`.
- DEV failure throws; production emits `app:error` on `eventBus` and drops.
- Cleans up on unmount.

## `SyncController` + registry

```ts
type SyncHandler = (socket: AppSocket, qc: QueryClient) => () => void;
registerSyncHandler(handler);   // module-load-time registration
```

`SyncController` (renderless) walks the registry on mount, calls each handler once the socket is available, tears down on socket teardown. Feature handlers are registered at boot via `ensureFeatureSyncRegistered()` ([`app/sync/featureSync.ts`](../../src/app/sync/featureSync.ts)).

Registered today: `registerChatsSync`, `registerMessagesSync`, `registerSessionsSync`, `registerAssignmentsSync`, `registerAdminSync`, `registerFeedbackSync`.

## Event contract

[`events.contract.ts`](../../src/realtime/events.contract.ts) mirrors backend Zod schemas:

| Inbound | Outbound |
|---|---|
| `ping`, `chats:join`, `chats:leave` | `pong`, `error:invalid_payload`, `message:new`/`message:ack`/`message:edited`/`message:deleted`/`message:reaction`, `chat:assigned`/`chat:unassigned`/`chat:read`/`chat:muted`, `session:status`, `user:updated`, `feedback:new` |

Drift between client and backend contract is caught by future integration tests (Phase 12).

## Connection banner

`ConnectionBanner.tsx` reads `connectionStatusStore` and renders a warning row above each layout whenever status is not `connected` / `idle`.

## Tests

| File | Coverage |
|---|---|
| `socket.test.ts` | Singleton + dispose semantics. |
| `SocketContext.test.tsx` | Lifecycle through `auth:ready` / `auth:logged-out` / connect / disconnect / manager reconnect (`sync:resume` + status transitions). |
| `useSocketEvent.test.tsx` | Zod gate (throws on bad payload, unsubscribes on unmount). |
| `ConnectionBanner.test.tsx` | Hidden when connected; shown otherwise. |
| `sync.controller.test.tsx` | Registry registers + tears down per-handler. |

## References

- Architecture: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §6, §11.
- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 5.
- Event bus: [`realtime-event-bus.md`](realtime-event-bus.md).
- Chats sync: [`chats.md`](chats.md). Messages sync: [`messages.md`](messages.md). Sessions sync: [`sessions.md`](sessions.md).
