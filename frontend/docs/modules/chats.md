# Module: Chats Feature (`features/chats`)

> Sidebar chat list — virtualized, filtered, real-time-synced, IDB-primed.

**Status:** Phase 7 — complete.

## Files

```
frontend/src/features/chats/
├── api/chats.api.ts                # list / markRead / setMuted / assign
├── types.ts                        # ChatDTO + ChatListPage + ChatFilters Zod schemas
├── store/chats.store.ts            # Zustand UI store (active, filters, search, selection)
├── hooks/
│   ├── useChatList.ts              # useInfiniteQuery + IDB hydration + write-through
│   ├── useChatActions.ts           # markRead/setMuted/assign w/ optimistic + rollback
│   └── useSyncActiveChatFromUrl.ts # URL ↔ store mirror
├── sync/
│   ├── chats.mutations.ts          # pure cache mutators
│   └── chats.sync.ts               # registers socket handlers
├── components/
│   ├── ChatList/ · ChatListItem/ · ChatSidebar/
│   ├── ChatFilters/ · ChatSearchBar/ · SessionSwitcher/
│   └── ChatContextMenu/
└── index.ts
```

## Data flow

- `useChatList()` runs `useInfiniteQuery({ queryKey: keys.chats(filters), getNextPageParam })`. Pre-mount: `readSnapshot('chats:list:firstPage', PersistedSnapshotSchema)` primes the cache. Post-success: writes the first page via debounced `writeSnapshot`.
- `useFilteredSearchedChats()` layers in-memory search over title + last-message preview.
- Filters are Zod-gated and localStorage-persisted by [`chats.store.ts`](../../src/features/chats/store/chats.store.ts).

## Mutations (`useChatActions`)

`markRead` · `setMuted` · `assign`. Pattern: snapshot every keyed `['chats', filters]` entry → `setQueryData` w/ pure helper → rollback on error. `assign` also invalidates `keys.assignments()` to keep the admin assignments cache in sync.

## Sync handlers ([`chats.sync.ts`](../../src/features/chats/sync/chats.sync.ts))

| Event | Effect |
|---|---|
| `message:new` | `bumpChatWithMessage` (move to top, +unread unless `fromSelf`). Also emits `message:received` on eventBus when `!fromSelf` (notifications hook). |
| `chat:assigned` | `applyAssigned` → also `invalidateQueries(keys.assignments())`. |
| `chat:unassigned` | `applyUnassigned` → same invalidation. |
| `chat:read` | `applyRead` zeroes `unreadCount`. |
| `chat:muted` | `applyMuted` flips `muted`. |

Pure mutators in [`chats.mutations.ts`](../../src/features/chats/sync/chats.mutations.ts).

## URL ↔ store

`useSyncActiveChatFromUrl()` (mounted in `DashboardLayout`) keeps `chatsUIStore.activeChatId` mirrored to `:chatId` URL param. Active-chat is used by notifications gating (`NotificationController`).

## Virtualization

`ChatList` uses `react-virtuoso` with stable `computeItemKey={chat.id}` + memoized `ChatListItem`. `endReached` calls `fetchNextPage`. Empty/error states use the `EmptyState` compound.

## Right-click menu (today)

`ChatContextMenu` is a Radix dropdown attached to the `MoreHorizontal` `IconButton` on each row — equivalent semantics to a native right-click. Native context-menu binding queued for the Phase 10 UX pass.

## Tests

| File | Coverage |
|---|---|
| `chats.mutations.test.ts` | 6 pure cases (bump, fromSelf, unknown, applyRead, applyMuted, applyAssigned/Unassigned). |
| `chats.store.test.ts` | Filter persistence, reset, selection toggle, active id. |
| `useChatActions.test.tsx` | MSW-backed markRead optimistic + setMuted rollback on 500. |

## References

- Architecture: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §16.1.
- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 7.
- Realtime: [`realtime.md`](realtime.md). State: [`state.md`](state.md). Messages: [`messages.md`](messages.md).
