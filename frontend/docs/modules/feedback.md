# Module: Feedback Feature (`features/feedback`)

> Admin inbox — paginated developer feedback w/ mark-read + live `feedback:new` arrival.

**Status:** Phase 9 — complete.

## Files

```
frontend/src/features/feedback/
├── api/feedback.api.ts        # list (cursor, unreadOnly) / markRead
├── types.ts                   # FeedbackDTO + FeedbackList Zod schemas
├── hooks/useFeedback.ts       # useInfiniteQuery + optimistic markRead
├── sync/
│   ├── feedback.mutations.ts  # applyRead / applyFeedbackNew pure helpers
│   └── feedback.sync.ts       # feedback:new → list({ limit: 1 }) → prepend
├── components/FeedbackPanel/  # paginated list, "New" badge, Mark-read, Load more
└── index.ts
```

## Backend contract

| Endpoint | Notes |
|---|---|
| `GET /api/feedback?cursor=…&limit=…&unreadOnly=1` | `{ items, nextCursor }` |
| `PATCH /api/feedback/:id` | `{ read: true }` → 204 |

Zod-parsed on the boundary.

## Sync handler

`feedback:new` payload carries only `{ id, ts }`. The handler refetches the first page via `list({ limit: 1 })`, matches the id, prepends the fresh item to the cache (`applyFeedbackNew` dedupes). Trade-off: one tiny extra HTTP call vs. forcing a full first-page invalidation that would scroll the panel.

## `markRead`

Optimistic — `setQueryData` w/ `applyRead`; snapshot rollback on failure.

## Tests

| File | Coverage |
|---|---|
| `feedback.mutations.test.ts` | `applyRead` flips target, `applyFeedbackNew` prepends, dedupe no-op. |

## References

- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 9.
