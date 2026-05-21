# Frontend Features Overview

DevChatDesk frontend is a React 19 + Vite single-page application that provides a shared WhatsApp inbox UI for internal development teams. Two roles — **Admin** and **Developer** — with role-gated routing and feature access throughout.

> **Status snapshot.** This document tracks **what is actually shipped today** vs. what remains. Phases 1–8 from `FRONTEND_IMPLEMENTATION_PLAN.md` are merged; Phases 9–12 (admin features, polish, observability, deployment) are not yet built. Each section below carries a status pill: **✅ Shipped**, **🟡 Partial**, **⏳ Deferred**.

---

## 1. Authentication ✅ Shipped

### Login
- Email/password login form ([features/auth/components/LoginForm.tsx](frontend/src/features/auth/components/LoginForm.tsx)) via React Hook Form + Zod resolver.
- JWT access token stored in memory only ([lib/storage/memory.ts](frontend/src/lib/storage/memory.ts)) — never persisted.
- Refresh token kept in HTTP-only cookie; silent refresh on `401` via axios interceptor in [lib/http/client.ts](frontend/src/lib/http/client.ts) + concurrent-request queue in [lib/http/retry.ts](frontend/src/lib/http/retry.ts).
- Redirects to `/dashboard` on success and honors `state.from` for deep-link bounce-back.

### Route Guards
- [ProtectedRoute](frontend/src/app/router/guards/ProtectedRoute.tsx) — blocks unauthenticated → `/login`.
- [AdminRoute](frontend/src/app/router/guards/AdminRoute.tsx) — non-admin → `/dashboard`.
- [PublicRoute](frontend/src/app/router/guards/PublicRoute.tsx) — authenticated → `/dashboard`.
- [RootRedirect](frontend/src/app/router/guards/RootRedirect.tsx) — `/` routes by role.
- Every guard waits on auth `initializing` status via [BootGate](frontend/src/app/ui/BootGate.tsx).

### Logout
- Manual logout in [useAuth.ts](frontend/src/features/auth/hooks/useAuth.ts) clears the in-memory token, resets auth state, **calls `clearAllPersistedData()` to wipe Dexie**, clears the cross-feature `currentUser` store, and emits `auth:logged-out` on the event bus (closing the socket).

### Password Change
- [PasswordChangeForm](frontend/src/features/auth/components/PasswordChangeForm.tsx) accessible from `/settings`.

---

## 2. Routing & App Shell ✅ Shipped

- React Router 7 data router ([AppRouter](frontend/src/app/router/AppRouter.tsx)).
- Typed route table in [routes.ts](frontend/src/app/router/routes.ts) — builders consume branded `ChatId`.
- Admin code-split via [lazyRoutes.ts](frontend/src/app/router/lazyRoutes.ts) + `<Suspense fallback={<BootGate />}>` — verified in `dist/.vite/manifest.json`.
- Per-route [RouteErrorBoundary](frontend/src/app/router/RouteErrorBoundary.tsx).
- `viewTransition` enabled on `<NavLink>` for smooth route changes where supported.
- 404 page for unknown routes.

---

## 3. Chat List Sidebar 🟡 Partial

The middle column in [DashboardLayout](frontend/src/app/router/layouts/DashboardLayout.tsx) ([ChatSidebar](frontend/src/features/chats/components/ChatSidebar/ChatSidebar.tsx)).

### Chat List Display ✅
- Avatar (image + initials fallback), title, last message preview, timestamp, unread count [Badge](frontend/src/design-system/primitives/Badge), mute glyph.
- Phone numbers never shown; default title from the DTO.

### Session Switcher 🟡
- [SessionSwitcher](frontend/src/features/chats/components/SessionSwitcher/SessionSwitcher.tsx) sidebar dropdown still uses a static list. Wiring it to `features/sessions` data (now real) is a small UX follow-up; the underlying sessions feature shipped in Phase 9.

### Filtering & Search ✅
- Real-time client-side search ([ChatSearchBar](frontend/src/features/chats/components/ChatSearchBar/ChatSearchBar.tsx)) over title + last-message preview.
- Filter toggles ([ChatFilters](frontend/src/features/chats/components/ChatFilters/ChatFilters.tsx)) persisted to `localStorage` via [lib/storage/localStorage.ts](frontend/src/lib/storage/localStorage.ts) and Zod-validated on read: unread only, assigned to me, hide muted (+ chat-kind whitelist).

### Pagination ✅
- Virtualized infinite scroll with `react-virtuoso` and cursor pagination in [useChatList.ts](frontend/src/features/chats/hooks/useChatList.ts).

### Context Menu ✅ (Radix dropdown surface)
- [ChatContextMenu](frontend/src/features/chats/components/ChatContextMenu/ChatContextMenu.tsx) — mark-read, mute/unmute. Assign action exists in [useChatActions.ts](frontend/src/features/chats/hooks/useChatActions.ts) and is now exposed via the admin [AssignmentsPanel](frontend/src/features/assignments/components/AssignmentsPanel/AssignmentsPanel.tsx); per-chat assign affordance in the chat row + native right-click binding are queued for Phase 10 UX pass.

### Mark as Read / Mute Toggle ✅
- Optimistic mutations in [useChatActions.ts](frontend/src/features/chats/hooks/useChatActions.ts) with snapshot rollback on failure.

### Real-Time Updates ✅
- [chats.sync.ts](frontend/src/features/chats/sync/chats.sync.ts) handles `message:new`, `chat:assigned`, `chat:unassigned`, `chat:read`, `chat:muted` — every handler `setQueryData` mutates the cache, never refetches. Pure helpers in [chats.mutations.ts](frontend/src/features/chats/sync/chats.mutations.ts) (`bumpChatWithMessage`, `applyAssigned/Unassigned/Read/Muted`).

### Cache Hydration ✅
- First page of the chat list persists to IndexedDB and re-hydrates instantly on reload via [usePersistentQuery](frontend/src/lib/query/usePersistentQuery.ts) + [persistence.service.ts](frontend/src/lib/storage/persistence.service.ts).

---

## 4. Chat Window 🟡 Partial

[ChatPage](frontend/src/app/router/pages/ChatPage.tsx) hosts the right column.

### Message List ✅
- Reverse-virtualized [MessageList](frontend/src/features/messages/components/MessageList/MessageList.tsx) (`react-virtuoso` w/ `followOutput="auto"`, stable per-row `computeItemKey`).
- Day dividers injected at render time.
- `startReached` triggers `useInfiniteQuery.fetchNextPage` for older pages.
- Empty / error / loading states via [EmptyState](frontend/src/design-system/compounds/EmptyState) + [Spinner](frontend/src/design-system/primitives/Spinner).

### Message Composer ✅ (text)
- [MessageComposer](frontend/src/features/messages/components/MessageComposer/MessageComposer.tsx) — Textarea + `Enter` submits, `Shift+Enter` inserts newline, IME-safe via `nativeEvent.isComposing`.
- Per-chat draft auto-saved (300ms debounce) to localStorage via [messages.store.ts](frontend/src/features/messages/store/messages.store.ts).
- Local component state isolates keystrokes from list re-renders.
- Restores text in the composer on send failure.

### Composer extras ⏳ (deferred)
- Emoji picker, media upload dialog, `@mention` autocomplete, quoted-reply selector UI, forward dialog — all pending. The reply preview rendering ([MessageQuotedPreview](frontend/src/features/messages/components/MessageQuotedPreview/MessageQuotedPreview.tsx)) is shipped, but selecting the reply target from the UI is not yet wired.

### Optimistic Send / Edit / Delete / React ✅
- All four implemented in [useMessageMutations.ts](frontend/src/features/messages/hooks/useMessageMutations.ts). Pure helpers in [optimistic/index.ts](frontend/src/features/messages/optimistic/index.ts): `makeTempId`, `buildPending`, `appendOptimistic`, `reconcileSend`, `markFailed`, `applyAck`, `applyEdit`, `applyDelete`, `applyReaction`.
- Reconciliation: when the echoed `message:new` socket event arrives, the messages sync handler dedupes by id; the send mutation reconciles by `tempId`. Exactly one rendered bubble.

### Message Reactions ✅
- [MessageReactions](frontend/src/features/messages/components/MessageReactions/MessageReactions.tsx) — emoji strip with count rollup, `aria-pressed` on mine, toggle off by re-clicking.

### Reply / Quoted Message ✅ (render only)
- Quoted block rendered inside the bubble. Scroll-to-original-on-tap not yet wired.

### In-Chat Search 🟡
- [MessageSearch](frontend/src/features/messages/components/MessageSearch/MessageSearch.tsx) input is wired; matches highlighted via `<mark>` in [MessageBubble](frontend/src/features/messages/components/MessageBubble/MessageBubble.tsx). Prev/next-match navigation pending (Phase 10).

### Chat Header ✅ (skeleton)
- Title currently shows the raw `chatId`; participant DTO + avatar enrichment pending once the backend endpoint lands.

### Profile / Contact / Assign / Forward Dialogs ⏳
- All deferred. The `chatsApi.assign` and `messagesApi.forward` API methods exist; the dialogs do not.

### Mute Toggle (from chat header) ⏳
- Currently only available from the chat list context menu.

---

## 5. Message Bubbles ✅ (text), ⏳ (media)

[MessageBubble](frontend/src/features/messages/components/MessageBubble/MessageBubble.tsx).

### Supported Message Types
| Type | Status |
|---|---|
| TEXT | ✅ Plain text rendering with search-match highlight. Linkification deferred. |
| IMAGE / VIDEO / AUDIO / DOCUMENT / STICKER | ⏳ Bubble renders the `body` text; media UI (lightbox, player, download) lands alongside WAHA media. |
| SYSTEM | ✅ Centered muted pill. |

### Media Lazy Decryption ⏳
- Dexie `mediaBlobs` table + `putMediaBlob`/`getMediaBlob` helpers shipped in [persistence.service.ts](frontend/src/lib/storage/persistence.service.ts) (200MB LRU eviction by `accessedAt`). The `useDecryptMedia(messageId)` hook is queued for Phase 10.

### Message Status (ACK) ✅
- Outbound bubbles show `Check`/`CheckCheck` for SENT / DELIVERED / READ / PLAYED — READ/PLAYED tinted with the accent color.

### Forwarded Label ✅
- "Forwarded" pill when `message.forwarded === true`.

### Direction & Sender Name ✅
- `senderId === currentUserId` drives mine-vs-other alignment + bubble color.
- Sender name shown above the bubble when present (group chats).

### Pending / Failed States ✅
- `status: 'pending'` shows an inline ellipsis; `status: 'failed'` shows a "Failed — retry" button.

### Deleted Tombstone ✅
- Deleted bubbles render *"Message deleted"* in muted italic.

### Edited Timestamp ✅
- "edited" label appears in the footer when `editedAt` is set.

---

## 6. Real-Time Core ✅ Shipped

- Singleton Socket.IO client ([realtime/socket.ts](frontend/src/realtime/socket.ts)) — `transports: ['websocket']`, `autoConnect: false`, `withCredentials: true`, auth callback reads the in-memory token (so rotated tokens flow into reconnects for free), spreads [RECONNECT_CONFIG](frontend/src/realtime/reconnect.ts) (30 s cap).
- [SocketContext](frontend/src/realtime/SocketContext.tsx) mounted in [AppProviders](frontend/src/app/providers/AppProviders.tsx) **above** `<AppRouter>` — route changes never tear down the connection. Opens on `auth:ready`, closes on `auth:logged-out`. Local `'io client disconnect'` does NOT flip status to reconnecting.
- [connectionStatusStore.ts](frontend/src/realtime/connectionStatusStore.ts) (Zustand): `idle | connecting | connected | reconnecting | offline`. Surfaced by [ConnectionBanner](frontend/src/realtime/ConnectionBanner.tsx) inside [DashboardLayout](frontend/src/app/router/layouts/DashboardLayout.tsx) + [AdminLayout](frontend/src/app/router/layouts/AdminLayout.tsx).
- Typed [useSocketEvent](frontend/src/realtime/useSocketEvent.ts) — Zod-validates payloads against [events.contract.ts](frontend/src/realtime/events.contract.ts); DEV throws on bad shape, prod logs `app:error` and drops.
- Typed event bus ([eventBus.ts](frontend/src/realtime/eventBus.ts), mitt-backed): `auth:ready`, `auth:logged-out`, `sync:resume`, `app:error`.
- [SyncController](frontend/src/realtime/sync.controller.ts) accepts handlers of shape `(socket, queryClient) => () => void` and tears them down on socket teardown. Central registration in [app/sync/featureSync.ts](frontend/src/app/sync/featureSync.ts) — invoked once at boot from [App.tsx](frontend/src/App.tsx) — wires `registerChatsSync` and `registerMessagesSync`.
- On manager reconnect, the provider emits `sync:resume` on the event bus. The `GET /api/sync?since=<seq>` resume endpoint is queued for Phase 10 (the event hook is in place).

### Outbound events covered by Zod schemas
`pong`, `error:invalid_payload`, `message:new`, `message:ack`, `message:edited`, `message:deleted`, `message:reaction`, `chat:assigned`, `chat:unassigned`, `chat:read`, `chat:muted`.

### Inbound events
`ping`, `chats:join`, `chats:leave` (mirroring the backend contract; backend wiring lands when feature endpoints come online).

---

## 7. Notifications, Sound, Favicon ✅ Shipped

Phase 10. [features/notifications/notification.service.ts](frontend/src/features/notifications/notification.service.ts) exposes a pure `shouldNotify(payload, gates)` (fromSelf / global mute / per-chat mute / active+focused / opt-in / permission gating — every branch unit-tested) and `createNotificationService(gates, outputs)` (subscribes `eventBus.on('message:received')` emitted by [chats.sync.ts](frontend/src/features/chats/sync/chats.sync.ts)). [NotificationController](frontend/src/app/notifications/NotificationController.tsx) wires settings + global mute + chat-cache + active-chat into outputs. Side-effect helpers: [lib/notifications/permission.ts](frontend/src/lib/notifications/permission.ts), [sound.ts](frontend/src/lib/notifications/sound.ts) (preloaded `Audio`), [favicon.ts](frontend/src/lib/notifications/favicon.ts) (throttled canvas badge, capped at 99+). `NotificationPermissionBanner` opt-in flow with localStorage dismissal.

---

## 8. Admin Dashboard ✅ Shipped

The `/admin` route, [AdminLayout](frontend/src/app/router/layouts/AdminLayout.tsx), and lazily-loaded admin sub-pages ([pages/admin/](frontend/src/app/router/pages/admin/)) now host real features. All admin code remains in a dedicated chunk (`dist/.vite/manifest.json` confirms ~25 KB raw / 6.5 KB gz, separate from the entry bundle) — non-admins never download this code.

| Panel | Status |
|---|---|
| Session Management | ✅ [SessionsPanel](frontend/src/features/sessions/components/SessionsPanel/SessionsPanel.tsx) — create/start/stop/delete + status badge |
| QR Code Panel | ✅ [QRPanel](frontend/src/features/sessions/components/QRPanel/QRPanel.tsx) — enabled iff status `SCAN_QR_CODE`, auto-refreshes on socket flip |
| Chat Assignment Panel | ✅ [AssignmentsPanel](frontend/src/features/assignments/components/AssignmentsPanel/AssignmentsPanel.tsx) — virtualized list, optimistic assign/unassign w/ rollback |
| Developer Management Panel | ✅ [DeveloperManagementPanel](frontend/src/features/admin/components/DeveloperManagementPanel/DeveloperManagementPanel.tsx) — create/disable/delete via RHF + Zod |
| Feedback Viewing Panel | ✅ [FeedbackPanel](frontend/src/features/feedback/components/FeedbackPanel/FeedbackPanel.tsx) — paginated inbox + mark-read |
| Global Mute Toggle | ✅ [GlobalMuteToggle](frontend/src/features/mute/components/GlobalMuteToggle/GlobalMuteToggle.tsx) — optimistic flip mounted inside the Users page |
| Admin Chat View (read any chat) | ⏳ Pending (backend dependency) |

Realtime: [sessions.sync.ts](frontend/src/features/sessions/sync/sessions.sync.ts) handles `session:status` → cache mutation + `sessions:status` event-bus fanout for QR refetch. [assignments.sync.ts](frontend/src/features/assignments/sync/assignments.sync.ts) handles `chat:assigned`/`chat:unassigned`. [admin.sync.ts](frontend/src/features/admin/sync/admin.sync.ts) handles `user:updated`. [feedback.sync.ts](frontend/src/features/feedback/sync/feedback.sync.ts) handles `feedback:new` (refetches `limit=1` to materialize body). All registered at boot via [app/sync/featureSync.ts](frontend/src/app/sync/featureSync.ts).

Cross-feature plumbing — [lib/data/useDirectory.ts](frontend/src/lib/data/useDirectory.ts) exposes the developer list keyed by `keys.users()` (same cache slot as admin's `useUsers`) so AssignmentsPanel can render its assignee `<select>` without crossing feature boundaries. [design-system/compounds/ConfirmDialog/](frontend/src/design-system/compounds/ConfirmDialog/ConfirmDialog.tsx) is the shared destructive-action confirmer.

---

## 9. Developer Dashboard ✅ Shipped (with caveats)

- `/dashboard` is the primary route ([DashboardLayout](frontend/src/app/router/layouts/DashboardLayout.tsx)), grid: nav | chat sidebar | message outlet.
- "Assigned to me" filter exists in the chat-list filter panel; server enforcement comes online when the backend `/api/chats` endpoint ships.
- Full text-message composer + reactions + edit/delete available.

---

## 10. WAHA Session Status Monitoring ✅ Shipped (admin view)

[SessionsPanel](frontend/src/features/sessions/components/SessionsPanel/SessionsPanel.tsx) renders each WAHA session with a [SessionStatusBadge](frontend/src/features/sessions/components/SessionStatusBadge/SessionStatusBadge.tsx) (STARTING / SCAN_QR_CODE / WORKING / STOPPED / FAILED), live-updated by the `session:status` socket event ([sessions.sync.ts](frontend/src/features/sessions/sync/sessions.sync.ts)). The connection-status banner ([ConnectionBanner](frontend/src/realtime/ConnectionBanner.tsx)) covers the socket itself; the dashboard-level WAHA banner (visible to developers) is queued for Phase 10 UX polish.

---

## 11. Feedback ✅ Shipped (admin viewer)

[FeedbackPanel](frontend/src/features/feedback/components/FeedbackPanel/FeedbackPanel.tsx) lists submissions w/ "New" badge + mark-read + Load-more. Socket `feedback:new` prepends fresh items via [feedback.sync.ts](frontend/src/features/feedback/sync/feedback.sync.ts). Developer-side submission UI ships with the broader Settings work in Phase 10.

---

## 12. User Preferences ✅ Shipped

- Theme preference persisted to localStorage with a synchronous bootstrap script in `index.html` ([public/theme-bootstrap.js](frontend/public/theme-bootstrap.js)) — no FOUC.
- Chat filter preferences persisted to localStorage via [localStorage.ts](frontend/src/lib/storage/localStorage.ts) (Zod-validated on read).
- Composer drafts persisted per-chat to localStorage.
- Notification preferences (desktop, sound, favicon badge) + language placeholder live in [shared/state/settings.ts](frontend/src/shared/state/settings.ts) (Zod-guarded localStorage); UI in [features/settings/components/SettingsScreen](frontend/src/features/settings/components/SettingsScreen/SettingsScreen.tsx) mounted on `/settings`.

---

## 13. API & Data Layer ✅ Shipped

### Axios Client
- Singleton in [lib/http/client.ts](frontend/src/lib/http/client.ts), `baseURL = env.VITE_API_BASE_URL`, `withCredentials: true`.
- Request interceptor attaches the in-memory `Bearer` token.
- Response interceptor handles `401` via [retry.ts](frontend/src/lib/http/retry.ts) — coalesces concurrent failures behind a single in-flight refresh promise, retries the original request, logs out on refresh failure.
- Backend error envelope `{ error: { code, message, correlationId } }` → typed [AppApiError](frontend/src/lib/http/errors.ts).

### TanStack Query
- Provider in [QueryProvider.tsx](frontend/src/app/providers/QueryProvider.tsx): `staleTime: Infinity`, `gcTime: 30min`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `retry: 1`, `mutations.retry: 0`. Socket-driven sync keeps the cache fresh, not time.
- Central typed `keys` factory in [shared/state/queryKeys.ts](frontend/src/shared/state/queryKeys.ts) — all `as const` tuples.

### Infinite Queries
- Chats list and per-chat messages both use `useInfiniteQuery` with cursor pagination.

### IndexedDB Persistence
- Dexie v1 in [lib/storage/indexedDB.ts](frontend/src/lib/storage/indexedDB.ts) — `snapshots(&key, updatedAt)` + `mediaBlobs(&messageId, accessedAt, size)`.
- [persistence.service.ts](frontend/src/lib/storage/persistence.service.ts): `readSnapshot` (Zod on read, drops on drift), debounced `writeSnapshot` (500ms), `clearAllPersistedData()`, `putMediaBlob`/`getMediaBlob` w/ 200MB LRU eviction.
- Generic [usePersistentQuery](frontend/src/lib/query/usePersistentQuery.ts) wrapper — primes the cache from IndexedDB on mount and writes successful results back.
- Graceful degradation when IndexedDB is unavailable (logged once, memory-only).

### Cross-Feature User State
- [shared/state/currentUser.ts](frontend/src/shared/state/currentUser.ts) — a slim Zustand store holding the current user id + display name. Auth writes; other features read via `useCurrentUserId()`. Lets the messages feature stay isolated from the auth feature without breaking the boundaries plugin.

---

## 14. Design System ✅ Shipped

- Tokens: CSS variables across `light`, `dark`, `high-contrast` themes in [design-system/tokens/themes/](frontend/src/design-system/tokens/themes/).
- [ThemeProvider](frontend/src/design-system/theme/) sets `data-theme` on `<html>`; synchronous bootstrap script in `index.html` (`public/theme-bootstrap.js`) applies the saved theme before React mounts — no FOUC. SHA-pinning queued for Phase 11.
- Primitives (Radix + class-variance-authority): Button, Input, Textarea, Dialog, Popover, Tooltip, Dropdown, Switch, Checkbox, Tabs, Toast, Avatar, Badge, Spinner, Skeleton.
- Compounds: EmptyState, SectionHeader, Tag, IconButton, ConfirmDialog.
- Motion system in [design-system/motion/](frontend/src/design-system/motion/): reusable variants + `usePrefersReducedMotion` hook that collapses transitions to instant.
- Storybook 8 with `addon-a11y` + theme toolbar; one story per primitive/compound.
- Dev-only `/__styleguide` route renders every component for visual smoke.
- Token-contrast Vitest suite enforces WCAG AA (21 cases).

---

## 15. Testing ✅ (foundation), 🟡 (coverage)

- Vitest + React Testing Library + `vitest-axe`.
- MSW shared server in [tests/mocks/server.ts](frontend/src/tests/mocks/server.ts), lifecycle wired in [tests/setup.ts](frontend/src/tests/setup.ts).
- `fake-indexeddb/auto` powers persistence tests.
- **171 tests pass** across 44 files (foundation, design system, HTTP/auth/refresh queue, router guards, real-time core, persistence, chats sync + store + actions, messages optimistic + composer interaction, sessions/assignments/admin/feedback/mute sync mutations + MSW round-trips, notification gating + favicon + offline send queue + settings store).
- Playwright E2E and Chromatic visual regression are Phase 12.
- Coverage thresholds (75% features, 90% realtime/lib) are not yet gated in CI.

---

## 16. Infrastructure & Configuration

| Concern | Detail |
|---|---|
| UI Components | Radix UI primitives + class-variance-authority |
| Styling | Tailwind v4 via `@tailwindcss/vite` reading CSS-variable tokens |
| Animations | Framer Motion + reduced-motion fallbacks |
| Virtualization | `react-virtuoso` (chat list and message list) |
| Realtime | `socket.io-client@4` |
| HTTP | axios + Zod-parsed responses |
| Persistence | Dexie (IndexedDB) + small localStorage wrapper |
| Form validation | React Hook Form + Zod resolver |
| Server state | TanStack Query v5 |
| Client state | Zustand |
| Tests | Vitest + RTL + MSW + `vitest-axe` + `fake-indexeddb` |
| Env vars | `VITE_API_BASE_URL`, `VITE_SOCKET_URL`, `VITE_APP_ENV`, `VITE_SENTRY_DSN` (parsed via Zod in [lib/env.ts](frontend/src/lib/env.ts)) |

---

## 17. What's Deferred to Phases 9–12

| Theme | Phase | What's missing |
|---|---|---|
| Admin features | 9 ✅ | Sessions panel, QR panel, assignments panel, user CRUD, feedback viewer, global mute — shipped |
| Sessions monitoring | 9 ✅ | Live WAHA session list, QR refresh on `session:status` — shipped |
| Notifications | 10 ✅ | Desktop notifications service, sound, favicon badge, permission banner, settings screen — shipped |
| Offline send queue | 10 ✅ | `navigator.onLine` queue + retry on `online` — shipped |
| Reduced-motion full audit | 10/12 | `usePrefersReducedMotion` hook ships; per-route axe sweep + Chromatic visual regression deferred to Phase 12 |
| Media handling | 10 (or w/ WAHA) | `useDecryptMedia`, MediaLightbox, MediaPlayer, MediaUploadDialog |
| Composer extras | 10 | Emoji picker, mentions autocomplete, reply selector, forward dialog |
| Observability | 11 | Sentry, Web Vitals beacons, custom metrics, debug overlay |
| Hardening | 11 | Strict CSP w/ SHA-pinned bootstrap, bundle-size CI gate |
| Testing maturity | 12 | Playwright E2E, Chromatic visual regression, coverage gates |
| Deployment | 12 | Dockerfile, nginx config, preview environments, Lighthouse CI |

Bundle today: **entry 891.70 KB raw / 275.37 KB gzipped**, admin chunk 1.76 KB raw / 0.69 KB gz. The 250 KB initial-JS budget will be enforced (and the bundle trimmed) in Phase 11.
