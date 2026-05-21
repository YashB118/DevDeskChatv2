# Module: Admin Users Feature (`features/admin`)

> User CRUD — create developer, disable/enable, delete. Backed by `/api/users` (shared cache slot w/ `useDirectory`).

**Status:** Phase 9 — complete.

## Files

```
frontend/src/features/admin/
├── api/admin.api.ts                  # listUsers / createUser / updateUser / deleteUser
├── types.ts                          # AdminUserDTO + AdminUserList + CreateUserInput + UpdateUserInput Zod schemas
├── hooks/useUsers.ts                 # useQuery(keys.users()) + mutations w/ invalidate
├── sync/admin.sync.ts                # socket user:updated → applyUserUpdated
├── components/
│   ├── DeveloperManagementPanel/     # list w/ role badge + enabled Switch + delete confirm
│   └── CreateUserDialog/             # RHF + zodResolver
└── index.ts
```

## Backend contract

| Endpoint | Notes |
|---|---|
| `GET /api/users` | `{ users: AdminUserDTO[] }` |
| `POST /api/users` | `CreateUserInput` → `AdminUserDTO` |
| `PATCH /api/users/:userId` | `UpdateUserInput` → `AdminUserDTO` |
| `DELETE /api/users/:userId` | 204 |

All Zod-parsed. Backend module not yet implemented — Zod-fails-closed on response drift.

## Sync handler

[`admin.sync.ts`](../../src/features/admin/sync/admin.sync.ts) listens to `user:updated`; pure `applyUserUpdated` flips `disabled`/`role` in the `keys.users()` cache. Disabling a user evicts their socket server-side; the UI surfaces it via the badge.

## Cross-feature

Same cache slot (`keys.users()`) feeds `lib/data/useDirectory.ts` consumed by [`assignments.md`](assignments.md) — prefetch on either side hydrates both.

## Tests

| File | Coverage |
|---|---|
| `admin.sync.test.ts` | `applyUserUpdated` flips disabled, updates role, undefined passthrough. |

## References

- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 9.
- Assignments: [`assignments.md`](assignments.md). Mute toggle on same page: [`mute.md`](mute.md).
