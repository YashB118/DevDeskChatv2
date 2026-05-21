# Module: Sessions Feature (`features/sessions`)

> Admin WAHA session management — list, create, start/stop/delete, QR auto-refresh on `session:status`.

**Status:** Phase 9 — complete.

## Files

```
frontend/src/features/sessions/
├── api/sessions.api.ts            # list/get/create/start/stop/remove/qr
├── types.ts                       # SessionDTO + SessionList + SessionQR + CreateSessionInput Zod schemas
├── hooks/
│   ├── useSessions.ts             # useQuery keys.sessions() + mutation set w/ invalidate
│   └── useSessionQR.ts            # enabled iff status === SCAN_QR_CODE; auto-invalidates on event bus flip
├── sync/
│   ├── sessions.mutations.ts      # applySessionStatus pure helper
│   └── sessions.sync.ts           # socket session:status → setQueryData + eventBus.emit('sessions:status', payload)
├── components/
│   ├── SessionsPanel/             # create/start/stop/delete + inline QR drawer
│   ├── SessionStatusBadge/        # STARTING / SCAN_QR_CODE / WORKING / STOPPED / FAILED
│   ├── QRPanel/                   # base64 SVG <img>
│   └── CreateSessionDialog/       # RHF + zodResolver
└── index.ts
```

## Backend contract

| Endpoint | Notes |
|---|---|
| `GET /api/sessions` | `{ sessions: SessionDTO[] }` |
| `GET /api/sessions/:name` | `SessionDTO` |
| `POST /api/sessions` | `{ name }` → `SessionDTO` (201) |
| `POST /api/sessions/:name/start` · `/stop` | `SessionDTO` |
| `DELETE /api/sessions/:name` | 204 |
| `GET /api/sessions/:name/qr` | `{ mimetype, data }` |

All responses Zod-parsed.

## QR refresh

`useSessionQR(name, enabled)`:
- Query enabled only when status === `SCAN_QR_CODE`.
- `eventBus.on('sessions:status', payload => if payload.name === name && payload.status === 'SCAN_QR_CODE' invalidate(['sessions', name, 'qr']))`.
- WAHA rotates QRs every 20–30s — invalidation refetches the SVG.

## Sync handler

[`sessions.sync.ts`](../../src/features/sessions/sync/sessions.sync.ts) Zod-validates `session:status`, calls `setQueryData<SessionList>(keys.sessions(), applySessionStatus)`, and fans out via `eventBus.emit('sessions:status', payload)` so `useSessionQR` consumers refetch.

## Destructive actions

Delete flows through [`design-system/compounds/ConfirmDialog`](../../src/design-system/compounds/ConfirmDialog/ConfirmDialog.tsx).

## Tests

| File | Coverage |
|---|---|
| `sessions.mutations.test.ts` | `applySessionStatus` flips matched name, no-op unknown, undefined passthrough. |
| `useSessions.test.tsx` | MSW list-parse case + create-invalidates-list case. |

## References

- Architecture: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §16.3.
- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 9.
- Backend: `backend/src/modules/sessions/`.
