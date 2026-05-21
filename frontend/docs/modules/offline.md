# Module: Offline (`lib/offline`)

> Connectivity store + send queue + banner. Independent of `realtime/` (boundaries plugin forbids `lib → realtime`); uses a local listener registry instead of the eventBus.

**Status:** Phase 10 — complete.

## Files

```
frontend/src/lib/offline/
├── connectivity.ts            # Zustand store + subscribeConnectivity + bindConnectivityListeners
├── sendQueue.ts               # FIFO of () => Promise<void>; flush on online
└── OfflineBanner.tsx          # status-aware banner (offline + queued count)
```

## `connectivity.ts`

```ts
useConnectivityStore             // { online: boolean; setOnline(next) }
subscribeConnectivity(listener)  // returns unsub
bindConnectivityListeners()      // attaches window 'online' / 'offline' (idempotent)
```

Bound once at boot from [`App.tsx`](../../src/App.tsx) via `bindConnectivityListeners()`. Initial value reads `navigator.onLine`.

## `sendQueue.ts`

```ts
enqueueSend(task)        // task: () => Promise<T>; returns QueuedSend item w/ id + attempts + enqueuedAt
flushSendQueue()         // FIFO, stops on first failing task (next online flips it again)
subscribeSendQueue(fn)   // size changes
getSendQueueSize()
_resetSendQueue()        // tests
```

A module-level `subscribeConnectivity` subscription flushes on every `online` transition. Tasks fail-fast — first error halts the loop; the queue waits for the next online event before retrying.

## `useSendMessage` integration

[`messages/hooks/useMessageMutations.ts`](../../src/features/messages/hooks/useMessageMutations.ts) branches on `useConnectivityStore.getState().online`:

- Online → run the mutation immediately.
- Offline → optimistically append + `enqueueSend(async () => messagesApi.send(...) → reconcileSend(...))`. Flush on reconnect reconciles as if online.

## `OfflineBanner`

Reads `useConnectivityStore` + `subscribeSendQueue`. Renders inside the layout header:

- Offline → "You're offline. Messages will send when you reconnect."
- Online w/ pending queue → "Reconnected — flushing N queued sends."

Mounted in `DashboardLayout` + `AdminLayout` under `ConnectionBanner`.

## Why not eventBus?

`lib/` cannot import from `realtime/` (boundaries policy: `lib → lib + shared` only). Local listener registry inside `connectivity.ts` keeps everything tier-correct. See [`memory/feedback_lib_no_realtime.md`](../../../.claude/projects/-home-empiric-Documents-DevDeskChatv2/memory/feedback_lib_no_realtime.md) for the rationale.

## Tests

| File | Coverage |
|---|---|
| `sendQueue.test.ts` | In-order flush, stop-on-fail-and-retry, subscriber size events, online-transition triggers flush. |

## References

- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 10.
- Messages: [`messages.md`](messages.md).
