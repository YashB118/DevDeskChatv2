# Module Index

Per-module context files. Add a new file here only when actual code for that module lands — empty stub folders do not get docs (progressive build rule).

## Built modules (after Phase 10)

| Module | Doc | Source |
|---|---|---|
| App Shell — boot orchestration, providers, error boundary, dev styleguide route | [`app-shell.md`](app-shell.md) | `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/app/` |
| Environment Configuration | [`env.md`](env.md) | `frontend/src/lib/env.ts` |
| Branded ID Types | [`shared-ids.md`](shared-ids.md) | `frontend/src/shared/types/ids.ts` |
| Design System — tokens, theme, motion, primitives, compounds (incl. ConfirmDialog), icons | [`design-system.md`](design-system.md) | `frontend/src/design-system/`, `frontend/src/styles/`, `frontend/public/theme-bootstrap.js`, `frontend/src/shared/utils/cn.ts`, `frontend/.storybook/` |
| HTTP Client + Errors + Refresh Queue | [`http.md`](http.md) | `frontend/src/lib/http/`, `frontend/src/lib/storage/memory.ts` |
| Realtime Core — socket singleton, event bus, useSocketEvent, SyncController, ConnectionBanner | [`realtime.md`](realtime.md) | `frontend/src/realtime/` |
| Routing & Guards | [`routing.md`](routing.md) | `frontend/src/app/router/` |
| State Foundation — TanStack Query + Dexie + usePersistentQuery + queryKeys | [`state.md`](state.md) | `frontend/src/app/providers/QueryProvider.tsx`, `frontend/src/lib/storage/`, `frontend/src/lib/query/`, `frontend/src/shared/state/queryKeys.ts` |
| Auth Feature | [`auth.md`](auth.md) | `frontend/src/features/auth/` |
| Chats Feature | [`chats.md`](chats.md) | `frontend/src/features/chats/` |
| Messages Feature | [`messages.md`](messages.md) | `frontend/src/features/messages/` |
| Sessions Feature (Admin) | [`sessions.md`](sessions.md) | `frontend/src/features/sessions/` |
| Assignments Feature (Admin) | [`assignments.md`](assignments.md) | `frontend/src/features/assignments/` |
| Admin Users Feature | [`admin.md`](admin.md) | `frontend/src/features/admin/` |
| Feedback Feature (Admin) | [`feedback.md`](feedback.md) | `frontend/src/features/feedback/` |
| Mute Feature (Global toggle) | [`mute.md`](mute.md) | `frontend/src/features/mute/` |
| Notifications Feature + Controller | [`notifications.md`](notifications.md) | `frontend/src/features/notifications/`, `frontend/src/lib/notifications/`, `frontend/src/app/notifications/NotificationController.tsx` |
| Settings Feature + Store | [`settings.md`](settings.md) | `frontend/src/features/settings/`, `frontend/src/shared/state/settings.ts`, `frontend/src/shared/state/settings.types.ts` |
| Offline (connectivity + send queue + banner) | [`offline.md`](offline.md) | `frontend/src/lib/offline/` |
| Realtime Event Bus | [`realtime-event-bus.md`](realtime-event-bus.md) | `frontend/src/realtime/eventBus.ts` |
| Tooling & Build | [`tooling.md`](tooling.md) | `frontend/package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `eslint.config.js`, `.storybook/`, `.github/workflows/frontend.yml` |

## Cross-feature plumbing

- `shared/state/currentUser.ts` — slim "who's logged in" Zustand store; auth writes, messages reads.
- `shared/state/settings.ts` (+ `settings.types.ts`) — user preferences (notifications, language) read by notifications + settings UI.
- `lib/data/useDirectory.ts` — read-only `/api/users` query keyed by `keys.users()`; consumed by AssignmentsPanel without crossing feature boundaries.
- `design-system/compounds/ConfirmDialog/` — shared destructive-action confirmer used by sessions + admin.

## Not yet built

- Observability (`lib/observability`) — Sentry, Web Vitals, custom metrics, beacons, debug overlay (Phase 11).
- Playwright E2E suite + Chromatic visual regression (Phase 12).
- Media subsystem: `useDecryptMedia`, MediaLightbox, MediaPlayer, MediaUploadDialog — paired with WAHA media pipeline.
- Composer extras: MentionAutocomplete, ForwardDialog, in-chat search prev/next nav (Phase 10/12 polish).
- `GET /api/sync?since=<seq>` resume hook (`sync:resume` event bus signal is wired; endpoint TBD).

See [`../context.md`](../context.md) §10 for the full phase status table.
