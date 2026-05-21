# Module: State Foundation

> TanStack Query v5 + Dexie/IndexedDB + central query-key factory + `usePersistentQuery`. Substrate every feature builds on.

**Status:** Phase 6 — complete.

## Files

```
frontend/src/
├── app/providers/QueryProvider.tsx               # QueryClient defaults
├── shared/state/queryKeys.ts                     # central as-const keys factory
├── lib/storage/
│   ├── indexedDB.ts                              # Dexie schema v1
│   ├── persistence.service.ts                    # read/write snapshots + media LRU + clearAll
│   ├── memory.ts                                 # in-memory access token (Phase 3)
│   └── localStorage.ts                           # Zod-guarded localStorage wrapper
└── lib/query/
    └── usePersistentQuery.ts                     # hydrate cache from IDB on mount; debounced write-through
```

## `QueryProvider` defaults

```ts
{
  queries: {
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: 1,
  },
  mutations: { retry: 0 },
}
```

Socket-driven sync keeps the cache fresh, not time.

## `keys` factory

`shared/state/queryKeys.ts` exposes `as const` tuples parametrized by branded IDs:

```ts
keys.me() · keys.chats(filters) · keys.chat(chatId)
keys.messages(chatId) · keys.message(chatId, messageId)
keys.assignments() · keys.assignmentsByUser(userId)
keys.sessions() · keys.session(sessionId)
keys.users() · keys.user(userId)
keys.feedback()
```

No feature inlines a query key string — always go through the factory.

## Dexie schema (v1)

```ts
db.version(1).stores({
  snapshots:  '&key, updatedAt',
  mediaBlobs: '&messageId, accessedAt, size',
});
```

`snapshots` holds normalized DTOs keyed by string slug (`'chats:list:firstPage'`, etc.). `mediaBlobs` holds decrypted media w/ 200 MB LRU eviction by `accessedAt`. Graceful degradation when IndexedDB is unavailable (logged once, memory-only).

## `persistence.service`

```ts
readSnapshot(key, zodSchema)              // Zod-validates on read; drops the row on drift
writeSnapshot(key, payload)               // debounced 500ms, last-write-wins
flushSnapshot(key)                        // immediate (tests)
putMediaBlob({ messageId, blob, size })   // LRU eviction kicks in past 200 MB
getMediaBlob(messageId)
clearAllPersistedData()                   // wipes both tables
```

`clearAllPersistedData()` is wired to manual logout AND the refresh-failure path in `AuthProvider`.

## `usePersistentQuery`

Generic wrapper that primes the cache from IndexedDB on mount (only when no cache exists) and writes successful results back via the debounced writer. Used today by chats + messages.

## `localStorage.ts`

Typed wrapper used for small UI prefs (theme, filters, drafts). `readLocal(key, schema)` Zod-validates; corrupt entries are deleted on read.

## Tests

| File | Coverage |
|---|---|
| `lib/storage/persistence.test.ts` | Snapshot round-trip, schema-drift drop, `clearAllPersistedData` empties both tables, media blob round-trip. |
| `lib/storage/localStorage.test.ts` | Read/write/corrupt-delete. |
| `lib/storage/memory.test.ts` | Token closure + non-leak to localStorage. |
| `shared/state/queryKeys.test.ts` | Factory shape. |

Tests run against `fake-indexeddb/auto` from `tests/setup.ts`.

## References

- Architecture: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §5, §11.
- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 6.
- Per-feature usage: [`chats.md`](chats.md), [`messages.md`](messages.md), [`auth.md`](auth.md).
