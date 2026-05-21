# Module: Assignments Feature (`features/assignments`)

> Admin panel — reassign / unassign chats across developers. Virtualized, optimistic.

**Status:** Phase 9 — complete.

## Files

```
frontend/src/features/assignments/
├── api/assignments.api.ts         # list (cursor) / assign / unassign
├── types.ts                       # AssignmentDTO + AssignmentList Zod schemas
├── hooks/useAssignments.ts        # useInfiniteQuery + useAssignmentActions optimistic
├── sync/
│   ├── assignments.mutations.ts   # applyAssigned / applyUnassigned across pages
│   └── assignments.sync.ts        # socket chat:assigned / chat:unassigned → setQueryData
├── components/AssignmentsPanel/   # react-virtuoso w/ assignee <select>
└── index.ts
```

## Data flow

- `useAssignments()` runs `useInfiniteQuery(keys.assignments())` cursor-paginated.
- `useAssignmentActions()` exposes `assign(chatId, userId)` + `unassign(chatId)` — snapshot every `['assignments', ...]` query → `setQueryData` w/ pure helper → rollback on error.

## Sync handlers

| Event | Effect |
|---|---|
| `chat:assigned` | `applyAssigned` across all paged caches. |
| `chat:unassigned` | `applyUnassigned`. |

Cross-cache: `useChatActions.assign` also `invalidateQueries(keys.assignments())` so the admin assignment list reflects developer-side moves.

## Developer dropdown

`AssignmentsPanel` renders a `<select>` populated by `useDirectory()` from [`lib/data/useDirectory.ts`](../../src/lib/data/useDirectory.ts) — keyed by `keys.users()` so the admin feature's `useUsers` and this dropdown share one cache. Filters out `disabled` users client-side.

## Tests

| File | Coverage |
|---|---|
| `assignments.mutations.test.ts` | `applyAssigned` sets target only, `applyUnassigned` clears assignedTo + name, undefined passthrough. |

## References

- Architecture: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §16.4.
- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 9.
- Chats: [`chats.md`](chats.md). Admin users: [`admin.md`](admin.md).
