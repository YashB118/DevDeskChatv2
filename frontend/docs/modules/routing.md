# Module: Routing & Guards (`app/router`)

> React Router 7 data router. Typed route table, composable guards, lazy-loaded admin chunk, per-route error boundaries. Mounts inside `AppProviders` so socket/sync/notifications survive every navigation.

**Status:** Phase 4 — complete.

## Files

```
frontend/src/app/router/
├── AppRouter.tsx              # createBrowserRouter + RouterProvider
├── routes.ts                  # typed routePaths + routes builders (routes.chat(chatId))
├── lazyRoutes.ts              # typed loader for the admin chunk
├── RouteErrorBoundary.tsx     # per-route fallback
├── guards/
│   ├── ProtectedRoute.tsx     # auth required → /login (preserves `from`)
│   ├── AdminRoute.tsx         # role === 'ADMIN' → /dashboard fallback
│   ├── PublicRoute.tsx        # authed users → /dashboard
│   └── RootRedirect.tsx       # '/' → /dashboard or /login
├── hooks/
│   └── useChatIdParam.ts      # Zod-parsed URL param → branded ChatId
├── layouts/{DashboardLayout,AdminLayout}.tsx
└── pages/
    ├── LoginPage.tsx · DashboardIndexPage.tsx · ChatPage.tsx
    ├── SettingsPage.tsx · NotFoundPage.tsx
    └── admin/{AdminIndexPage,SessionsPage,AssignmentsPage,UsersPage,FeedbackPage,index.ts}
```

## Route table

| Path | Guards | Element |
|---|---|---|
| `/` | — | `RootRedirect` |
| `/login` | `PublicRoute` | `LoginPage` |
| `/dashboard` | `ProtectedRoute` | `DashboardLayout` w/ `<Outlet>` |
| `/dashboard/:chatId` | `ProtectedRoute` | `ChatPage` (uses `useChatIdParam`) |
| `/settings` | `ProtectedRoute` | `DashboardLayout` → `SettingsPage` |
| `/admin/*` | `ProtectedRoute` → `AdminRoute` | Lazy `AdminLayout` (Suspense fallback `<BootGate />`) |
| `/admin/sessions` · `/admin/assignments` · `/admin/users` · `/admin/feedback` | as above | Lazy admin pages |
| `*` | — | `NotFoundPage` |

Every route declares `errorElement={<RouteErrorBoundary />}`.

## Guard behavior

All guards consume `useAuth()` and wait on `status === 'initializing'` by rendering `<BootGate />` to avoid premature redirects.

- `ProtectedRoute` — unauthenticated → `<Navigate to="/login" state={{ from }} />`.
- `AdminRoute` — `role !== 'ADMIN'` → `<Navigate to="/dashboard" />`.
- `PublicRoute` — authenticated → `<Navigate to="/dashboard" />`.
- `RootRedirect` — picks `/dashboard` or `/login` based on auth state.

## Layouts

- `DashboardLayout` (3-column grid: primary nav | chat sidebar | outlet) mounts `ConnectionBanner` + `OfflineBanner` + `NotificationPermissionBanner`. Includes `useSyncActiveChatFromUrl()` so `chatsUIStore.activeChatId` mirrors the URL.
- `AdminLayout` (top nav row) mounts `ConnectionBanner` + `OfflineBanner`. Admin subnav uses NavLinks with `viewTransition`.

## Code splitting

Admin pages are imported via `lazy(() => import('./pages/admin').then(m => ({ default: m.X })))` in [`AppRouter.tsx`](../../src/app/router/AppRouter.tsx). The Vite build emits a dedicated admin chunk (~24 KB raw / 6 KB gz) separate from the entry; `lazyRoutes.test.ts` inspects `dist/.vite/manifest.json` to confirm.

## View Transitions

NavLinks pass `viewTransition` and programmatic `navigate(..., { viewTransition: true })` opts into the browser API where supported.

## `useChatIdParam`

```ts
const chatId = useChatIdParam();  // throws on missing/invalid param
```

Wraps `useParams<{ chatId: string }>()` + `toChatId()` so consumers receive a branded `ChatId` rather than `string`.

## Tests

| File | Coverage |
|---|---|
| `AppRouter.test.tsx` | Guard transitions (protected/admin/public/root), `/admin/sessions` renders real admin shell w/ MSW-stubbed `/api/sessions`, 404 for unknown routes, chat-id param. Wraps the test render with `QueryClientProvider` + `ToastProvider`. |
| `useChatIdParam.test.tsx` | Happy + throw paths. |
| `lazyRoutes.test.ts` | Admin only via dynamic import; build-manifest assertion that admin chunk is separate from entry. |

> jsdom + undici Web Fetch incompat with `createMemoryRouter` is sidestepped by mirroring `routeObjects` with `<MemoryRouter><Routes>` in tests.

## References

- Architecture: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §8.
- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 4.
- Auth: [`auth.md`](auth.md).
- App shell: [`app-shell.md`](app-shell.md).
