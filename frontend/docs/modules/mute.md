# Module: Mute Feature (`features/mute`)

> Workspace-wide notification mute toggle. Read by `NotificationController` to suppress every notification when on.

**Status:** Phase 9 — complete.

## Files

```
frontend/src/features/mute/
├── api/mute.api.ts                       # get / set
├── types.ts                              # GlobalMute Zod schema
├── hooks/useGlobalMute.ts                # useQuery + optimistic mutation + rollback
├── components/GlobalMuteToggle/          # Switch + toast on success/fail
└── index.ts
```

## Backend contract

| Endpoint | Notes |
|---|---|
| `GET /api/mute/global` | `{ muted: boolean }` |
| `PATCH /api/mute/global` | `{ muted }` → `{ muted }` |

## Consumers

- `UsersPage` (admin) mounts `GlobalMuteToggle` below the developer list.
- `NotificationController` reads `useGlobalMute().data?.muted` — when `true`, `shouldNotify` returns `{ desktop:false, sound:false, badge:false }`.

## Tests

| File | Coverage |
|---|---|
| `useGlobalMute.test.tsx` | MSW-backed optimistic flip + rollback on 500. |

## References

- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 9.
- Notifications: [`notifications.md`](notifications.md).
