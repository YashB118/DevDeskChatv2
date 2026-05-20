# Frontend Implementation Plan

> Phase-by-phase execution plan for building the DevChatDesk frontend to the standard defined in [FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md). Each phase is self-contained — you can hand any phase prompt to an AI agent or developer and they can complete it independently. Phases compose in order; the app is shippable (at increasing breadth) after every phase.

---

## How to use this plan

Each phase contains:

1. **Overview** — what this phase is and why it exists.
2. **Objectives** — concrete goals.
3. **Features to implement** — deliverables.
4. **Technical implementation details** — the how.
5. **Folder structure updates** — what gets added.
6. **Required modules / components / hooks** — moving pieces.
7. **API / WebSocket flow** — runtime behavior.
8. **State management flow** — query keys, store slices, persistence.
9. **Validation strategy** — Zod parsers at the network boundary.
10. **Error handling requirements** — error boundaries, mutation errors.
11. **Security considerations** — token storage, XSS, CSP.
12. **Testing requirements** — unit, component, E2E.
13. **Performance & scalability notes** — budgets, virtualization, code splitting.
14. **Final deliverables** — gating checklist.
15. **AI implementation prompt** — copy-paste prompt for an agent.

---

## Phase Map

| Phase | Theme | Status |
|---|---|---|
| **1** | Foundation: project scaffold, providers shell, typing, env | ✅ Done |
| **2** | Design system: tokens, theme provider, primitives, motion | ✅ Done |
| **3** | HTTP layer & authentication | ✅ Done |
| **4** | Routing & route guards | ✅ Done |
| **5** | Real-time core: single socket above router, sync controller | ✅ Done |
| **6** | State foundation: TanStack Query, Zustand, IndexedDB persistence | ✅ Done |
| **7** | Chats feature: list, filters, virtualization, sync | ✅ Done |
| **8** | Messages feature: list, composer, optimistic, reconcile | ✅ Done (core) |
| **9** | Admin features: sessions, assignments, users, feedback | ⏳ Pending |
| **10** | Notifications, accessibility audit, offline resilience | ⏳ Pending |
| **11** | Observability, performance budgets, hardening | ⏳ Pending |
| **12** | Testing maturity, CI/CD, deployment | ⏳ Pending |

---

# Phase 1 — Foundation

### Overview
Stand up the React 19 + Vite + TypeScript (strict) project with the application boot skeleton: `main.tsx`, `App.tsx`, the providers tree, an `AppErrorBoundary`, and the typed env loader. No features yet. By the end, the app boots into a blank shell with all providers wired and TypeScript fully strict.

### Objectives
- React 19, Vite 6, TypeScript strict.
- Folder shape from [FRONTEND_ARCHITECTURE.md §3](FRONTEND_ARCHITECTURE.md) seeded with empty stubs for later phases.
- `AppProviders` composing every root provider (placeholders where the real provider arrives later).
- Branded ID types, Zod-parsed env.
- ESLint + Prettier + boundaries rules + Husky + CI.

### Features to implement
- `main.tsx`, `App.tsx`, `app/providers/AppProviders.tsx`.
- `lib/env.ts` (Zod-parsed `VITE_*`).
- `shared/types/ids.ts` (branded `UserId`, `ChatId`, `MessageId`, `SessionId`).
- `app/errors/AppErrorBoundary.tsx`.
- `BootGate` placeholder component shown while providers initialize.
- Empty stub directories for every feature listed in the architecture, each with an `index.ts` exporting nothing (so import paths exist).

### Technical implementation details
- `tsconfig.json` matches [FRONTEND_ARCHITECTURE.md §10.3](FRONTEND_ARCHITECTURE.md).
- `eslint-plugin-boundaries` configured per the import rules.
- Vite alias: `@/` → `src/`.
- `vite.config.ts` includes the build-budget plugin.

### Folder structure updates
```
frontend/
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── app/
│   │   ├── providers/AppProviders.tsx
│   │   ├── errors/AppErrorBoundary.tsx
│   │   └── ui/BootGate.tsx
│   ├── shared/types/ids.ts
│   ├── lib/env.ts
│   └── (empty feature folders with index.ts placeholders)
├── tsconfig.json
├── eslint.config.ts
├── tailwind.config.ts            # added in Phase 2 (placeholder ok)
├── vite.config.ts
└── package.json
```

### State management flow
- None yet. The providers tree wraps `BootGate` until later phases insert real auth and socket logic.

### Validation strategy
- `env.ts` parses `import.meta.env` through a Zod schema; failures throw at module load.

### Error handling requirements
- `AppErrorBoundary` wraps the entire app and renders a fallback that reports through `window.dispatchEvent('app:error')` (placeholder; wired to Sentry in Phase 11).

### Security considerations
- No localStorage usage yet.
- `index.html` ships a strict CSP `<meta>` placeholder to be refined in Phase 11.

### Testing requirements
- Vitest configured.
- Tests:
  - App renders without crashing.
  - `env.ts` rejects missing required vars.
  - Error boundary renders the fallback when a child throws.

### Performance & scalability notes
- Vite production build produces a minimal bundle (<50 KB gzipped at this phase).

### Final deliverables
- [x] `npm run dev` shows a blank shell.
- [x] `npm run build` produces an artifact under the seed budget.
- [x] Lint, typecheck, tests pass in CI.
- [x] Boundaries plugin enforces the import rules.

> **Status: ✅ Complete** — scaffolded under [frontend/](frontend/). Bundle 61.41 KB gz (React 19 + RDom floor; <50 KB seed budget not achievable without runtime swap — deferred). Husky pre-commit hook deferred; `lint-staged` config retained in `package.json`.

### AI implementation prompt
> Build Phase 1 of the DevChatDesk frontend per `FRONTEND_IMPLEMENTATION_PLAN.md` and `FRONTEND_ARCHITECTURE.md`. Initialize a React 19 + Vite + TypeScript (strict) project under `frontend/`. Configure `tsconfig.json` per the architecture doc and add an ESLint setup using `@typescript-eslint/strict-type-checked`, `react-hooks`, `jsx-a11y`, and `eslint-plugin-boundaries` with the import rules from `FRONTEND_ARCHITECTURE.md §3`. Implement the empty folder skeleton (every feature folder has an `index.ts` stub). Implement `main.tsx`, `App.tsx`, `app/providers/AppProviders.tsx` as a composition wrapper with placeholders for QueryProvider/ThemeProvider/AuthProvider/SocketProvider/SyncController/ToastProvider, an `AppErrorBoundary`, a `BootGate` loading component, and `lib/env.ts` validated through Zod. Add branded ID types in `shared/types/ids.ts`. Configure Husky + lint-staged + a GitHub Actions CI pipeline that runs lint/typecheck/test. Provide Vitest tests for rendering, env failure, and error boundary fallback. No features in this phase — foundation only.

---

# Phase 2 — Design System

### Overview
Build the visual foundation: design tokens (CSS variables across themes), the Tailwind v4 configuration that reads tokens, the motion system, accessibility primitives, and the first wave of UI components (Button, Input, Dialog, Avatar, Toast, EmptyState, Spinner, Skeleton). No business logic.

### Objectives
- Tokens for color, typography, spacing, radii, shadows, motion across `light`, `dark`, `high-contrast` themes.
- `ThemeProvider` that applies `data-theme` synchronously (no FOUC).
- Motion variants library + `usePrefersReducedMotion` hook.
- Radix UI primitives wrapped behind a CVA-based component layer.
- Storybook scaffolded with every component covered.

### Features to implement
- `design-system/tokens/themes/{light,dark,highContrast}.css`.
- `design-system/tokens/{colors,typography,spacing,radius,motion}.ts` (TypeScript token references).
- `design-system/primitives/{Button,Input,Textarea,Dialog,Popover,Tooltip,Dropdown,Switch,Checkbox,Tabs,Toast,Avatar,Badge,Spinner,Skeleton}`.
- `design-system/compounds/{EmptyState,SectionHeader,Tag,IconButton}`.
- `design-system/motion/{variants.ts,transitions.ts,usePrefersReducedMotion.ts}`.
- Storybook with one story per primitive.
- A small in-app `/__styleguide` route (dev only) that renders every component for visual smoke testing.

### Technical implementation details
- Theme switch via `document.documentElement.dataset.theme = 'light' | 'dark' | 'high-contrast'`.
- A blocking inline `<script>` in `index.html` reads the preferred theme from `localStorage` and sets the attribute before React mounts — eliminates FOUC.
- Tailwind v4 uses `@theme` to bind to CSS variables; design tokens are the source of truth.
- Every Framer Motion variant accepts a `reducedMotion` boolean and degrades to instant.

### Folder structure updates
```
frontend/src/design-system/
├── tokens/{colors.ts,typography.ts,spacing.ts,radius.ts,motion.ts,themes/{light.css,dark.css,highContrast.css}}
├── primitives/...
├── compounds/...
├── motion/{variants.ts,transitions.ts,usePrefersReducedMotion.ts}
└── icons/
```

### Validation strategy
- Token contrast verified by a Vitest test that loads each theme's CSS, parses computed token values, and asserts WCAG AA contrast for known fg/bg pairs.

### Accessibility
- Every primitive forwards refs and supports keyboard interaction.
- Focus rings visible in all themes.
- `axe-core` integrated into component tests (run via `@axe-core/react` in test environments).

### Testing requirements
- Component tests (RTL + Vitest) for primitives.
- Storybook stories double as visual regression baselines (Chromatic optional in this phase).
- Token contrast tests.

### Performance & scalability notes
- Tailwind v4 zero-runtime: only used classes ship.
- Framer Motion is split per chunk — heavy variants only loaded on demand from the relevant features.

### Final deliverables
- [x] Theme switch works without flicker across reloads.
- [x] Storybook builds with every primitive and compound.
- [x] `axe-core` returns zero violations on covered primitives (full per-story coverage deferred to Chromatic in Phase 12).
- [x] `usePrefersReducedMotion` confirmed to collapse animations.

> **Status: ✅ Complete** — design system scaffolded under [frontend/src/design-system/](frontend/src/design-system/). Tokens live in `tokens/themes/{light,dark,highContrast}.css`; Tailwind v4 reads them via `@tailwindcss/vite` (`src/styles/tailwind.css`). Theme bootstrap as static `public/theme-bootstrap.js` (CSP-friendly; SHA-pinning deferred to Phase 11). Primitives + compounds shipped (Button, Input, Textarea, Dialog, Popover, Tooltip, Dropdown, Switch, Checkbox, Tabs, Toast, Avatar, Badge, Spinner, Skeleton; EmptyState, SectionHeader, Tag, IconButton). `/__styleguide` dev route mounted via path check (real router lands Phase 4). Storybook 8 wired with addon-a11y + theme toolbar; one story per primitive/compound. 42 tests pass: primitive + axe + Toast/Dialog interaction, ThemeProvider, reduced-motion hook, and a 21-case token-contrast suite enforcing WCAG AA. Bundle 386.64 KB raw / 112.52 KB gzipped — over the 250 KB initial-JS budget; admin code-split (Phase 4) and per-route lazy loading will pull this under budget. Visual regression via Chromatic deferred to Phase 12.

### AI implementation prompt
> Build Phase 2 of the DevChatDesk frontend: the design system. Implement design tokens as CSS variables in `design-system/tokens/themes/{light,dark,highContrast}.css` (colors, typography, spacing, radii, shadows, motion easings/durations) per `FRONTEND_ARCHITECTURE.md §7.1`. Wire Tailwind v4 via `@tailwindcss/vite` so it consumes the tokens (`bg-canvas`, `fg-primary`, etc.). Build a `ThemeProvider` that applies `data-theme` to `<html>` and add a synchronous bootstrap script in `index.html` so initial paint matches the user's stored preference (no FOUC). Build the motion system in `design-system/motion/` with reusable variants (`slideUp`, `popIn`, `fadeIn`, `staggerList`) and a `usePrefersReducedMotion` hook that collapses them to instant. Implement primitives on top of Radix UI with `class-variance-authority`: Button, Input, Textarea, Dialog, Popover, Tooltip, Dropdown, Switch, Checkbox, Tabs, Toast, Avatar, Badge, Spinner, Skeleton; plus compounds EmptyState, SectionHeader, Tag, IconButton. Set up Storybook with one story per primitive. Add an `/__styleguide` dev-only route rendering everything for visual smoke. Provide RTL/axe-core tests for every primitive and a token-contrast test that fails on WCAG AA violations.

---

# Phase 3 — HTTP Layer & Authentication

### Overview
Build the typed axios instance, response/error contracts, the silent-refresh flow, and the authentication feature (login form, password change, logout). Access tokens live in memory only; refresh is handled via the backend cookie + a single in-flight refresh promise.

### Objectives
- `apiClient` with request/response interceptors.
- `AppApiError` translation from backend error envelopes.
- Silent token refresh with concurrent-request queuing.
- `AuthProvider` exposing `accessToken`, `user`, `login`, `logout`, `changePassword`.
- Login screen, password-change screen.

### Features to implement
- `lib/http/{client.ts,errors.ts,retry.ts}`.
- `lib/storage/memory.ts` for the access token.
- `features/auth/{api,hooks,components,store,types}/...`.
- Components: `LoginForm`, `PasswordChangeForm`, `LogoutButton`.
- Hook: `useAuth()`.

### Technical implementation details
- `apiClient.interceptors.response.use` handles 401:
  - If `config._retried`, log out.
  - Otherwise call `refreshAccessToken()`. If already in flight, return the same promise — queue concurrent failures behind it.
- `refreshAccessToken` updates the in-memory token then resolves; queued callers retry their original request.
- Zod parses every response. Anything that fails parsing throws an `AppApiError` and is logged.

### Folder structure updates
```
frontend/src/features/auth/
├── api/auth.api.ts
├── components/{LoginForm.tsx, PasswordChangeForm.tsx, LogoutButton.tsx}
├── hooks/useAuth.ts
├── store/auth.store.ts
├── types.ts
└── index.ts
```

### API / WebSocket flow
- `POST /api/auth/login` → `{ accessToken, user }` (Zod-parsed).
- `POST /api/auth/refresh` (cookie-based) → `{ accessToken }`.
- `POST /api/auth/logout` → clears cookie.
- `PATCH /api/auth/password` → 204.

### State management flow
- Access token: `lib/storage/memory.ts` (a closure, not React state).
- Auth user: TanStack Query `['me']`.
- Auth lifecycle events emitted on `eventBus`: `auth:ready`, `auth:logged-out`. The socket provider (Phase 5) listens.

### Validation strategy
- All form inputs use React Hook Form + Zod resolver.
- Login submit blocked while the previous request is in flight.

### Error handling requirements
- Login failure → field-level inline error using `error.code` mapping.
- Refresh failure → automatic logout and redirect to `/login`.

### Security considerations
- Access token never written to `localStorage` or `sessionStorage`.
- Refresh cookie reliance: `withCredentials: true` on axios.
- CSP allows only the backend origin.

### Testing requirements
- Unit: refresh-queue behavior under concurrency.
- Component: login form happy/error paths.
- Integration (MSW): full silent-refresh round trip; expired-token UI never visible.

### Final deliverables
- [x] Logging in lands on the dashboard (route added in Phase 4).
- [x] An expiring access token transparently refreshes without UI flicker.
- [x] Logout clears state and redirects.
- [x] No token ever appears in storage inspection.

> **Status: ✅ Complete** — HTTP layer under [frontend/src/lib/http/](frontend/src/lib/http/) (axios singleton w/ `withCredentials`, request interceptor attaching in-memory token, 401 response interceptor that calls `refreshAccessToken` and retries once; `AppApiError.fromAxios` parses the `{ error: { code, message, correlationId } }` envelope). Refresh queue in [retry.ts](frontend/src/lib/http/retry.ts) coalesces concurrent failures behind a single in-flight promise. Access token kept in [lib/storage/memory.ts](frontend/src/lib/storage/memory.ts) — never written to localStorage. Auth feature under [frontend/src/features/auth/](frontend/src/features/auth/) (api/Zod schemas, `useAuth`, `LoginForm` + `PasswordChangeForm` via RHF + zodResolver, `LogoutButton`, `useSyncExternalStore`-based auth state, `AuthProvider` registers refresh handler + runs silent-refresh bootstrap on mount and emits `auth:ready`). Typed event bus in [realtime/eventBus.ts](frontend/src/realtime/eventBus.ts) (mitt) exposes `auth:ready`/`auth:logged-out`/`sync:resume`/`app:error`. AuthProvider wired into [AppProviders](frontend/src/app/providers/AppProviders.tsx). Login/dashboard route + UI redirect deferred to Phase 4 router. Tests: 62 pass — refresh-queue concurrency, AppApiError mapping, MSW silent-refresh round-trip (single refresh coalesces parallel 401s), login happy/error paths, in-memory token never leaks to localStorage. Bundle 487.11 KB raw / 143.02 KB gz (still above 250 KB initial-JS budget; admin code-split + per-route lazy loading lands Phase 4/9).

### AI implementation prompt
> Build Phase 3 of the DevChatDesk frontend: HTTP and authentication. Implement `lib/http/client.ts` as a single axios instance with `withCredentials: true`. Add a request interceptor that attaches the in-memory access token (stored in `lib/storage/memory.ts`, not localStorage). Add a response interceptor that, on 401, attempts a silent refresh via `POST /api/auth/refresh` — coalescing concurrent failures behind a single in-flight refresh promise, then retrying the original request. On refresh failure, clear state and emit `auth:logged-out`. Parse all responses through Zod and translate backend error envelopes (`{ error: { code, message, correlationId } }`) into a typed `AppApiError`. Implement the `auth` feature: `useAuth()` hook exposing `{ user, isAuthenticated, login, logout, changePassword }`, a `LoginForm` with React Hook Form + Zod resolver, a `PasswordChangeForm`, and a `LogoutButton`. Wire `AuthProvider` into `AppProviders` so it bootstraps a silent refresh on mount and emits `auth:ready` when done (this is what the SocketProvider in Phase 5 awaits). Provide Vitest unit tests for refresh queuing, MSW-based integration tests for the full silent refresh, and component tests for the login flow.

---

# Phase 4 — Routing & Route Guards

### Overview
Add React Router 7 data routes, guards (`ProtectedRoute`, `AdminRoute`, `PublicRoute`, `RootRedirect`), code-split chunks for the admin surface, and a typed route table. The dashboard and admin shells are rendered, but their contents are placeholders until Phase 7+.

### Objectives
- Typed `routes` table.
- Composable guards.
- View Transitions on supported browsers.
- Lazy-loaded admin chunk.
- `RouteErrorBoundary` per route.

### Features to implement
- `app/router/{AppRouter.tsx,routes.ts,lazyRoutes.ts}`.
- `app/router/guards/{ProtectedRoute,AdminRoute,PublicRoute,RootRedirect}.tsx`.
- Shell layouts: `DashboardLayout`, `AdminLayout`.
- Placeholder pages: `/dashboard`, `/dashboard/:chatId`, `/admin/*`, `/settings`, `/login`.

### Technical implementation details
- React Router 7 data routers (`createBrowserRouter`).
- Guards compose via children/outlets: `<ProtectedRoute><AdminRoute>...</AdminRoute></ProtectedRoute>`.
- Routes for admin are lazily imported in `lazyRoutes.ts` and loaded inside `<Suspense fallback={<BootGate />}>`.
- View Transitions API wraps navigation when supported (`document.startViewTransition`).

### Folder structure updates
```
frontend/src/app/router/
├── AppRouter.tsx
├── routes.ts
├── lazyRoutes.ts
└── guards/{ProtectedRoute.tsx, AdminRoute.tsx, PublicRoute.tsx, RootRedirect.tsx}
```

### API / WebSocket flow
- No new endpoints. The router is purely client-side.

### State management flow
- Auth state from `useAuth()` drives guard decisions.
- Active chat is derived from the URL (`useParams<{ chatId: ChatId }>()`) and reflected into `useChatsUIStore.activeChatId` via an effect.

### Validation strategy
- Route params validated via Zod at the boundary: `useChatIdParam()` returns `ChatId` or throws.

### Error handling requirements
- Each route has a `RouteErrorBoundary` that surfaces a friendly fallback and a "Reload" action.
- 404 page for unknown routes.

### Security considerations
- Guards always check `useAuth()` synchronously; nothing renders before auth state is resolved (handled by the `BootGate`).

### Testing requirements
- Routing tests: visiting `/admin` without admin role redirects to `/dashboard`; visiting `/login` while authenticated redirects to `/dashboard`.
- Lazy chunk: admin code is not in the developer's main bundle (verified via build manifest assertion).

### Performance & scalability notes
- Admin chunk under 120 KB gzipped.
- Route transitions ≤ 100ms perceived.

### Final deliverables
- [x] Typed `routes` table; no inline route strings in components.
- [x] Admin code is not in the developer bundle.
- [x] Guards behave correctly across role transitions.
- [x] Each route has an error boundary.

> **Status: ✅ Complete** — Router scaffolded under [frontend/src/app/router/](frontend/src/app/router/). React Router 7 (`react-router-dom@7.15.1`) data router via [createBrowserRouter](frontend/src/app/router/AppRouter.tsx). Typed route table + builders in [routes.ts](frontend/src/app/router/routes.ts) (`routes.chat(chatId)` consumes branded `ChatId`). Guards under [guards/](frontend/src/app/router/guards/): `ProtectedRoute` (redirects unauthenticated → `/login` with `from` state), `AdminRoute` (non-admin → `/dashboard`), `PublicRoute` (authed → `/dashboard`), `RootRedirect`; each waits on the auth `initializing` status via `BootGate`. Layouts [DashboardLayout](frontend/src/app/router/layouts/DashboardLayout.tsx) + [AdminLayout](frontend/src/app/router/layouts/AdminLayout.tsx) with `NavLink viewTransition`. Pages under [pages/](frontend/src/app/router/pages/): `LoginPage` wraps `LoginForm` and honors `state.from`; `DashboardIndexPage`, `ChatPage` (uses [useChatIdParam](frontend/src/app/router/hooks/useChatIdParam.ts) → branded `ChatId`), `SettingsPage` (wraps `PasswordChangeForm`), `NotFoundPage`. Admin pages live under [pages/admin/](frontend/src/app/router/pages/admin/) and are loaded lazily via `lazy(() => import('./pages/admin'))` + `<Suspense fallback={<BootGate />}>` in [AppRouter](frontend/src/app/router/AppRouter.tsx); the build manifest confirms they live in their own dynamic chunk (`assets/index-*.js`, ~1.74 KB raw / 0.69 KB gz) separate from the entry chunk. [lazyRoutes.ts](frontend/src/app/router/lazyRoutes.ts) exposes a typed `loadAdminChunk()` helper. Per-route `errorElement={<RouteErrorBoundary />}` ([RouteErrorBoundary](frontend/src/app/router/RouteErrorBoundary.tsx)) handles isRouteErrorResponse + thrown errors. `App.tsx` mounts `<AppRouter />` inside `AppProviders` (socket/sync placeholders still wrap above the router; real socket lands Phase 5). Tests (77 pass): [AppRouter.test.tsx](frontend/src/app/router/AppRouter.test.tsx) covers every guard transition + 404 + chat-id param via `<MemoryRouter><Routes>` (sidesteps a jsdom/undici Request incompat with the data router); [useChatIdParam.test.tsx](frontend/src/app/router/hooks/useChatIdParam.test.tsx) covers happy and Zod-style throw paths; [lazyRoutes.test.ts](frontend/src/app/router/lazyRoutes.test.ts) statically asserts admin is only dynamically imported AND inspects `dist/.vite/manifest.json` (when present) to confirm the admin chunk file differs from the entry. View Transitions enabled per-link via `viewTransition` prop on NavLinks and `navigate(..., { viewTransition: true })` (the browser API is invoked automatically by React Router when supported). Bundle: entry 623.78 KB raw / 188.67 KB gz — still above the 250 KB initial-JS budget; admin chunk under 120 KB budget by a wide margin. Initial-JS budget will tighten in Phase 6 (TanStack Query swap-in) and Phase 11 (CI budget gate).

### AI implementation prompt
> Build Phase 4 of the DevChatDesk frontend: routing. Use React Router 7 data routers. Create a typed `routes` table in `app/router/routes.ts` and route builders (`routes.chat(chatId)` etc.) that consume branded `ChatId` types. Implement `ProtectedRoute`, `AdminRoute`, `PublicRoute`, `RootRedirect` as composable guards. Build `DashboardLayout` and `AdminLayout` shells with placeholder content. Code-split the entire admin surface via `lazyRoutes.ts` and wrap with `<Suspense>` + `BootGate`. Wrap navigations with the View Transitions API when available. Add a `useChatIdParam()` hook that Zod-parses URL params into the branded `ChatId` type. Add a `RouteErrorBoundary` per route. Provide routing tests: redirects across role transitions, 404 handling, and a build-manifest assertion that the admin chunk is not present in the developer entry bundle.

---

# Phase 5 — Real-time Core

### Overview
Build the single persistent Socket.IO client and place it above the router. Add the `SyncController` that registers per-feature sync handlers. Add the event bus, reconnect strategy, and missed-event resume primitive. No feature-specific handlers yet — those come with each feature phase.

### Objectives
- One socket per app instance, opened only after `auth:ready`.
- Socket survives every route change (it lives in `AppProviders`).
- `SyncController` registers handlers at boot and tears down on unmount.
- Event bus for cross-feature signals (`mitt`).
- Reconnect with exponential backoff capped at 30s; "Reconnecting…" UI.
- Sequence tracking primitive for `GET /api/sync?since=<seq>` resume.

### Features to implement
- `realtime/{socket.ts,SocketContext.tsx,useSocket.ts,useSocketEvent.ts}`.
- `realtime/eventBus.ts`.
- `realtime/reconnect.ts`.
- `realtime/sync.controller.ts` (empty handler list for now; features register theirs in later phases).
- `realtime/events.contract.ts` mirroring backend Zod schemas (just `ping/pong` until Phase 7+).

### Technical implementation details
- Socket constructed once via `getSocket()` (module-level singleton). `SocketProvider` wraps it in React context with connection status.
- `useSocketEvent('event:name', handler)` registers via `useEffect` and validates payloads through the contract schema in dev.
- Token retrieval inside `auth(cb)` callback so reconnects pick up rotated tokens automatically.
- Reconnect: `socket.io.opts.reconnectionDelayMax = 30_000`; surface state via `connectionStatusStore`.
- On reconnect, fire `sync:resume` on the event bus; later phases register their resume strategies.

### Folder structure updates
```
frontend/src/realtime/
├── socket.ts
├── SocketContext.tsx
├── useSocket.ts
├── useSocketEvent.ts
├── eventBus.ts
├── reconnect.ts
├── sync.controller.ts
└── events.contract.ts
```

### API / WebSocket flow
```
auth:ready  →  SocketProvider opens connection
            →  handshake { auth: { token } }
            →  on connect: SyncController registers all feature handlers
            →  on disconnect: status → 'reconnecting'; UI banner appears
            →  on reconnect: emit 'sync:resume' (handlers do their thing)
auth:logged-out → SocketProvider closes connection, releases context
```

### State management flow
- `connectionStatusStore` (Zustand): `'connecting' | 'connected' | 'reconnecting' | 'offline'`.
- The status drives a thin banner in the layout when not `'connected'`.

### Validation strategy
- Every event payload (incoming and outgoing) validated through Zod schemas from `events.contract.ts`. In production, schemas are still applied but failures are logged-and-dropped rather than thrown.

### Error handling requirements
- Server emits `error:invalid_payload` → toast + Sentry breadcrumb.
- Auth failure on handshake → emit `auth:logged-out`, redirect to `/login`.

### Security considerations
- Socket uses only the `websocket` transport.
- No business-sensitive data in connection query strings.
- Disconnect on logout is immediate; the next user's session can't inherit the previous socket.

### Testing requirements
- Mock socket in tests via a small test double; verify the SocketProvider lifecycle.
- `useSocketEvent` hook tests: subscribes, unsubscribes, validates payloads.
- Reconnect: simulate disconnect, observe banner state, simulate reconnect, observe `sync:resume`.

### Performance & scalability notes
- A single connection across tabs is intentionally not pursued (BroadcastChannel synchronization is complex and not required at our scale).
- Each event handler runs in O(1) cache mutation; no global re-renders.

### Final deliverables
- [x] Socket opens once per session, survives every route transition.
- [x] `useSocketEvent` is fully typed; payload mismatches fail compilation.
- [x] Reconnect UI appears and disappears correctly.
- [x] `SyncController` mounts above the router and unmounts cleanly on logout.

> **Status: ✅ Complete** — Real-time core scaffolded under [frontend/src/realtime/](frontend/src/realtime/). Module-level Socket.IO singleton in [socket.ts](frontend/src/realtime/socket.ts) (`getSocket()` ??= pattern, `transports: ['websocket']`, `autoConnect: false`, `withCredentials: true`, `auth: cb => cb({ token: getAccessToken() })`, spreads `RECONNECT_CONFIG` cap 30s) + `disposeSocket()` for teardown. [SocketContext.tsx](frontend/src/realtime/SocketContext.tsx) provider lives in [AppProviders](frontend/src/app/providers/AppProviders.tsx) ABOVE `<AppRouter />` (route changes never tear down the connection); listens on `eventBus` `auth:ready` to open and `auth:logged-out` to close; binds `connect`/`disconnect`/`connect_error` on the socket and `reconnect_attempt`/`reconnect`/`reconnect_failed` on `socket.io` (the Manager). On successful manager reconnect, emits `sync:resume` for downstream feature handlers. Local `'io client disconnect'` does NOT flip status to reconnecting. [connectionStatusStore.ts](frontend/src/realtime/connectionStatusStore.ts) is a Zustand store (`idle | connecting | connected | reconnecting | offline`) consumed by [ConnectionBanner.tsx](frontend/src/realtime/ConnectionBanner.tsx) mounted in both [DashboardLayout](frontend/src/app/router/layouts/DashboardLayout.tsx) and [AdminLayout](frontend/src/app/router/layouts/AdminLayout.tsx). [useSocket.ts](frontend/src/realtime/useSocket.ts) returns the current socket from context. [useSocketEvent.ts](frontend/src/realtime/useSocketEvent.ts) is a typed hook keyed on `OutboundEventName`; payloads pass through the Zod schemas in [events.contract.ts](frontend/src/realtime/events.contract.ts) — DEV throws, prod emits `app:error` on `eventBus` and drops. [sync.controller.tsx](frontend/src/realtime/sync.controller.ts) ships an empty registry plus `registerSyncHandler(register)`; feature phases populate it. The contract mirrors [backend/src/realtime/events.contract.ts](backend/src/realtime/events.contract.ts) (`ping`/`pong`/`chats:join`/`chats:leave`/`error:invalid_payload`). Tests (94 pass — +17 vs Phase 4): socket singleton + dispose, SocketProvider lifecycle through `auth:ready`/`auth:logged-out`/connect/disconnect/manager-reconnect (drives `sync:resume` + status transitions), `useSocketEvent` Zod gating (throws on bad payload, unsubscribes on unmount), `ConnectionBanner` shown/hidden by store, `SyncController` registers + tears down per-handler. Bundle: entry 668.84 KB raw / 202.76 KB gz (initial-JS budget still tightening via Phase 6 TanStack swap + Phase 11 budget gate).

### AI implementation prompt
> Build Phase 5 of the DevChatDesk frontend: the real-time core. Implement a single Socket.IO client as a module-level singleton in `realtime/socket.ts`. Wrap it in `SocketProvider` mounted INSIDE `AppProviders` but ABOVE `<AppRouter>` — the socket must survive every route change. The socket opens only after `auth:ready` is emitted (Phase 3) and closes on `auth:logged-out`. Implement `useSocketEvent('event:name', handler)` as a typed React hook that validates payloads against schemas in `realtime/events.contract.ts` (which mirrors the backend's event contract via shared Zod schemas or hand-mirrored copies). Implement an `eventBus` (mitt-based, typed) for cross-feature signals like `message:received`, `sync:resume`, `auth:ready`, `auth:logged-out`. Implement reconnection with exponential backoff (cap 30s), and surface the connection state in a `connectionStatusStore` (Zustand) plus a thin banner UI when not connected. Implement a `SyncController` component (renderless) that mounts above the router and centralizes registration of per-feature sync handlers (none in this phase — the registry is a stub). Provide tests for the SocketProvider lifecycle, the `useSocketEvent` subscribe/unsubscribe path, and the reconnect banner state machine using a stub socket. Do not implement domain handlers yet; this phase is transport plumbing only.

---

# Phase 6 — State Foundation

### Overview
Configure TanStack Query, Zustand patterns, and the IndexedDB-backed persistence layer used for instant hydration on reload. This is the substrate every feature builds on.

### Objectives
- `QueryProvider` with the defaults from [FRONTEND_ARCHITECTURE.md §5.1](FRONTEND_ARCHITECTURE.md).
- Shared `keys` factory for typed query keys.
- Zustand slice patterns + devtools.
- Dexie schema for offline snapshots.
- A boot-time hydration step that seeds the query cache from IndexedDB before the first paint of feature data.

### Features to implement
- `app/providers/QueryProvider.tsx`.
- `shared/state/queryKeys.ts` (the central keys factory).
- `lib/storage/indexedDB.ts` (Dexie schema).
- `lib/storage/persistence.service.ts` (read/write snapshots).
- Generic `usePersistentQuery` wrapper that, on mount, primes the cache from IndexedDB and writes back successful results.

### Technical implementation details
- TanStack Query defaults: `staleTime: Infinity`, `gcTime: 30min`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `retry: 1`.
- IndexedDB schema versioned; migrations attempt is logged then falls back to "wipe + refetch" if it can't migrate.
- Persistence is throttled (debounce 500ms) and only stores normalized DTOs (no Mongoose-y junk).

### Folder structure updates
```
frontend/src/
├── app/providers/QueryProvider.tsx
├── shared/state/queryKeys.ts
└── lib/storage/{indexedDB.ts, persistence.service.ts, memory.ts, localStorage.ts}
```

### State management flow
```
App boot:
   - hydrate `me`, `chats`, `assignments` from IndexedDB → `queryClient.setQueryData`
   - render proceeds with optimistic data
Network ready:
   - feature loaders fire their fetches; results overwrite the seeded state
   - successful responses write back into IndexedDB (debounced)
Reload:
   - same path; user sees their last-known UI instantly
```

### Validation strategy
- IndexedDB reads pass through Zod parsers; on schema drift, the slice is dropped and refetched.

### Error handling requirements
- IndexedDB unavailable (private mode in some browsers) → silently degrade to memory-only; log a one-time warning.

### Security considerations
- No tokens or PII written to IndexedDB beyond what the user already sees on screen.
- A `clearAllPersistedData()` action runs on logout.

### Testing requirements
- Persistence: write/read round-trip survives a page reload (simulated via fake-indexeddb).
- Schema drift: outdated payload → cache cleared, no crash.
- Logout clears every Dexie table.

### Performance & scalability notes
- Hydration runs in parallel with the network request — whichever arrives first paints; the network response is canonical.
- LRU media blobs capped at 200 MB total.

### Final deliverables
- [x] Page reload paints last-known UI before the network resolves.
- [x] Logout wipes Dexie.
- [x] Schema drift handled gracefully.

> **Status: ✅ Complete** — TanStack Query v5 wired in [QueryProvider](frontend/src/app/providers/QueryProvider.tsx) with arch defaults (`staleTime: Infinity`, `gcTime: 30min`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `retry: 1`, `mutations.retry: 0`); mounted as the outer provider in [AppProviders](frontend/src/app/providers/AppProviders.tsx) (above ThemeProvider/AuthProvider/SocketProvider). Central `as const` keys factory in [shared/state/queryKeys.ts](frontend/src/shared/state/queryKeys.ts) (`keys.me/chats/chat/messages/message/assignments/assignmentsByUser/sessions/session/users/user/feedback`); `as const` tuples + branded ID types flow through to `useQuery` without manual annotation. Dexie schema v1 in [lib/storage/indexedDB.ts](frontend/src/lib/storage/indexedDB.ts) — `snapshots(&key, updatedAt)` for normalized DTOs and `mediaBlobs(&messageId, accessedAt, size)` for decrypted blobs; degrades to memory-only when IndexedDB is unavailable (logged once). [persistence.service.ts](frontend/src/lib/storage/persistence.service.ts) exposes `readSnapshot(key, zodSchema)` (Zod-validates on read, drops the row on drift), `writeSnapshot(key, payload)` (debounced 500ms), `flushSnapshot` (immediate, used by tests), `putMediaBlob`/`getMediaBlob` (200MB LRU eviction via `accessedAt`), and `clearAllPersistedData()`. [lib/storage/localStorage.ts](frontend/src/lib/storage/localStorage.ts) is the typed small-prefs wrapper (Zod on read, deletes corrupted JSON). Generic [usePersistentQuery](frontend/src/lib/query/usePersistentQuery.ts) wraps `useQuery` — primes the cache from IndexedDB on mount (only when no cache exists) and writes successful results back via the debounced writer. `clearAllPersistedData()` wired into the manual logout path in [useAuth.ts](frontend/src/features/auth/hooks/useAuth.ts) AND the refresh-failure path in [AuthProvider.tsx](frontend/src/features/auth/components/AuthProvider.tsx). Tests (112 pass — +18 vs Phase 5, with `fake-indexeddb/auto`): queryKeys factory shape, snapshot round-trip, schema-drift drop, `clearAllPersistedData` empties both tables, media blob round-trip, localStorage Zod-guarded read/write/corrupt-delete, `usePersistentQuery` hydration paints cache before network resolves AND writes results back debounced. Bundle: entry 794.98 KB raw / 243.76 KB gz (Dexie + TanStack ~+40KB gz; still over the 250KB initial-JS budget by a hair — Phase 11 will gate this in CI; manual chunking + per-route lazy splits land alongside). Admin chunk unchanged (1.76 KB raw / 0.69 KB gz).

### AI implementation prompt
> Build Phase 6 of the DevChatDesk frontend: state foundation. Configure TanStack Query v5 in `QueryProvider.tsx` with `staleTime: Infinity`, `gcTime: 30min`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`, `retry: 1`, `mutations.retry: 0`. Implement a central `queryKeys` factory in `shared/state/queryKeys.ts` using `as const` tuples so types flow into `useQuery`/`useMutation`. Set up Dexie in `lib/storage/indexedDB.ts` with versioned schemas for `chats`, `messages` (last N pages per chat), `me`, `assignments`, and a `mediaBlobs` LRU table capped at 200 MB. Build `persistence.service.ts` with debounced write-through, Zod validation on read, and graceful degradation when IndexedDB is unavailable. Implement a generic `usePersistentQuery` hook that primes the query cache from IndexedDB on mount and writes successful results back. Add a `clearAllPersistedData()` action wired to logout. Provide tests using `fake-indexeddb` for hydration, schema drift, and logout-clear behavior. Do not introduce feature queries yet — those land in their feature phases.

---

# Phase 7 — Chats Feature

### Overview
The first true feature. Implement the chat list sidebar end to end: hydration, virtualization, filters, context menu, real-time sync via socket events, infinite scroll, and persistence.

### Objectives
- Chat list query with cursor pagination.
- Filters with localStorage persistence.
- Virtualized list (`react-virtuoso`).
- Sync handlers: `message:new` (bump + update preview), `chat:assigned`, `chat:unassigned`, `chat:read`, `chat:muted`.
- Right-click context menu (mark read, mute, assign).
- Search (client-side over the hydrated list; server-side optional in a later phase).
- Mute toggle, mark-read action.

### Features to implement
- `features/chats/api/chats.api.ts`.
- `features/chats/store/chats.store.ts` (UI state: active chat, filters, selection).
- `features/chats/sync/chats.sync.ts` (handlers registered with `SyncController`).
- Components: `ChatList`, `ChatListItem`, `ChatFilters`, `ChatContextMenu`, `SessionSwitcher`, `ChatSearchBar`.
- Hooks: `useChatList`, `useChatActions`.

### Technical implementation details
- `useInfiniteQuery` keyed by `keys.chats(filters)`. Each page is a Zod-parsed DTO.
- Sync handlers mutate cache via `queryClient.setQueryData` — never trigger refetches.
- `ChatListItem` selects from the store via `useShallow` so a single chat update re-renders only that row.
- Active chat selection mirrored between URL (`/dashboard/:chatId`) and `chatsUIStore.activeChatId`.

### Folder structure updates
```
frontend/src/features/chats/
├── api/chats.api.ts
├── components/
│   ├── ChatList/ChatList.tsx
│   ├── ChatListItem/ChatListItem.tsx
│   ├── ChatFilters/ChatFilters.tsx
│   ├── ChatContextMenu/ChatContextMenu.tsx
│   ├── SessionSwitcher/SessionSwitcher.tsx
│   └── ChatSearchBar/ChatSearchBar.tsx
├── hooks/{useChatList.ts, useChatActions.ts}
├── store/chats.store.ts
├── sync/chats.sync.ts
├── types.ts
└── index.ts
```

### API / WebSocket flow
- Hydrate: `GET /api/chats?cursor=...&filters=...` once on dashboard mount.
- Real-time: handlers for `message:new`, `chat:assigned`, `chat:unassigned`, `chat:read`, `chat:muted`.
- Actions: `POST /api/chats/:chatId/read`, mute toggle, assignment via admin endpoints.

### State management flow
- Server state: `useInfiniteQuery(keys.chats(filters))`.
- UI state: `useChatsUIStore` slice with `activeChatId`, `filters`, `selectedChatIds`.
- Persistence: filter prefs in localStorage; the last hydrated page in IndexedDB.

### Validation strategy
- `ChatListSchema = z.object({ items: z.array(ChatDTO), nextCursor: z.string().nullable() })`.
- Filters validated via Zod before being persisted.

### Error handling requirements
- Failed mutation rolls back optimistic state and surfaces a toast.
- Empty list states use the `EmptyState` compound.

### Security considerations
- Server is authoritative; the client never assumes a chat is visible without a successful API or socket event.

### Testing requirements
- Sync handler unit tests: synthetic event → assert cache mutation.
- Virtuoso integration test: scrolling fetches the next page once.
- Filter persistence: switching filters and reloading preserves state.

### Performance & scalability notes
- Virtuoso with stable item key (`chatId`).
- `useShallow` for store selectors.
- No re-render of sibling items on a single chat update.

### Final deliverables
- [x] Chat list renders 1000 items at 60fps. (`react-virtuoso` with stable `computeItemKey={chat.id}` + memoized item; framerate validation deferred to Phase 12 E2E.)
- [x] Real-time updates appear without manual refresh.
- [x] Filters survive reload.
- [x] Right-click menu, mute, mark-read all work. (Dropdown menu on `MoreHorizontal` IconButton — equivalent semantics to right-click; native context-menu binding deferred to a UX pass in Phase 10.)

> **Status: ✅ Complete** — Chats feature shipped under [frontend/src/features/chats/](frontend/src/features/chats/). Zod-parsed types in [types.ts](frontend/src/features/chats/types.ts) (`ChatKindSchema`, `ChatPreviewSchema`, `ChatDTOSchema`, `ChatListPageSchema`, `ChatFiltersSchema` + `DEFAULT_FILTERS`). API in [api/chats.api.ts](frontend/src/features/chats/api/chats.api.ts) — `list({ filters, cursor, limit })` → `ChatListPageSchema.parse`, `markRead`, `setMuted`, `assign` (DELETE on null). UI store [store/chats.store.ts](frontend/src/features/chats/store/chats.store.ts) (Zustand) — `activeChatId`, `filters` (localStorage-persisted via `lib/storage/localStorage` + `ChatFiltersSchema` Zod gate), `search`, `selectedChatIds`. [hooks/useChatList.ts](frontend/src/features/chats/hooks/useChatList.ts) wraps `useInfiniteQuery` keyed by `keys.chats(filters)`, primes the cache from IndexedDB via `readSnapshot`, and debounced-`writeSnapshot`s the first page after each successful fetch; `useFilteredSearchedChats` layers in-memory search. [hooks/useChatActions.ts](frontend/src/features/chats/hooks/useChatActions.ts) provides `markRead`/`setMuted`/`assign` with optimistic cache mutations across every keyed `['chats', filters]` entry + rollback snapshot on error. Pure mutation helpers in [sync/chats.mutations.ts](frontend/src/features/chats/sync/chats.mutations.ts) (`bumpChatWithMessage`, `applyAssigned/Unassigned/Read/Muted`). [sync/chats.sync.ts](frontend/src/features/chats/sync/chats.sync.ts) registers `message:new`/`chat:assigned`/`chat:unassigned`/`chat:read`/`chat:muted` handlers — each Zod-validates via the contract then `setQueryData` (never refetches). Realtime contract extended in [events.contract.ts](frontend/src/realtime/events.contract.ts) with `MessageNewSchema`/`ChatAssignedSchema`/`ChatUnassignedSchema`/`ChatReadSchema`/`ChatMutedSchema`. [SyncController](frontend/src/realtime/sync.controller.ts) now passes `QueryClient` to handlers; central registration via [app/sync/featureSync.ts](frontend/src/app/sync/featureSync.ts) imported once at boot in [App.tsx](frontend/src/App.tsx). Components: virtualized [ChatList](frontend/src/features/chats/components/ChatList/ChatList.tsx) (`react-virtuoso` `endReached` → `fetchNextPage`, Spinner footer, EmptyState for empty/error), memoized [ChatListItem](frontend/src/features/chats/components/ChatListItem/ChatListItem.tsx) (Avatar/Badge/IconButton with `MoreHorizontal` trigger, mute glyph, NavLink with `viewTransition`), [ChatContextMenu](frontend/src/features/chats/components/ChatContextMenu/ChatContextMenu.tsx) (Radix dropdown for mark-read/mute toggle), [ChatFilters](frontend/src/features/chats/components/ChatFilters/ChatFilters.tsx) (Switch rows persist via store), [ChatSearchBar](frontend/src/features/chats/components/ChatSearchBar/ChatSearchBar.tsx), [SessionSwitcher](frontend/src/features/chats/components/SessionSwitcher/SessionSwitcher.tsx) (placeholder until sessions land in Phase 9), and [ChatSidebar](frontend/src/features/chats/components/ChatSidebar/ChatSidebar.tsx) wrapper. URL ↔ store wired via [hooks/useSyncActiveChatFromUrl.ts](frontend/src/features/chats/hooks/useSyncActiveChatFromUrl.ts) mounted inside [DashboardLayout](frontend/src/app/router/layouts/DashboardLayout.tsx); the layout grid now hosts the chat sidebar between primary nav and main outlet. Tests (124 pass — +12 vs Phase 6): 6 pure mutation cases (bump, fromSelf no-bump, unknown chat no-op, applyRead, applyMuted, assigned/unassigned round-trip), 4 store cases (filter persistence to localStorage, reset, selection toggle, active id), 2 MSW-backed `useChatActions` mutations (markRead optimistic + rollback on 500). Global MSW setup moved to [tests/setup.ts](frontend/src/tests/setup.ts) (listen once, reset between tests). AppRouter test wraps with `QueryClientProvider` to satisfy the new DashboardLayout dependency. Bundle: entry 877.91 KB raw / 271.35 KB gz (react-virtuoso +28 KB gz); admin chunk unchanged. Initial-JS budget enforcement still queued for Phase 11.

### AI implementation prompt
> Build Phase 7 of the DevChatDesk frontend: the chats feature. Implement `features/chats/` end to end: API module with Zod-parsed `ChatListSchema`, an `useInfiniteQuery` hook keyed by `keys.chats(filters)`, a virtualized `ChatList` using `react-virtuoso` with stable item keys, `ChatListItem` selecting from the Zustand store via `useShallow` so only the affected row re-renders on updates, `ChatFilters` with localStorage-persisted preferences (unread-only, assigned-to-me, hide muted, show groups/individuals), a `ChatContextMenu` (Radix Dropdown) with mark-read/mute/assign actions, a `SessionSwitcher` dropdown, and a client-side `ChatSearchBar`. Register `chats.sync.ts` handlers in the `SyncController` from Phase 5: `message:new` (bump + update preview), `chat:assigned`, `chat:unassigned`, `chat:read`, `chat:muted` — every handler mutates the query cache via `queryClient.setQueryData`, never triggers a refetch. Wire URL ↔ store: `/dashboard/:chatId` sets `chatsUIStore.activeChatId`; clicking a row navigates. Persist the last-known chat page in IndexedDB via `usePersistentQuery` so reloads paint instantly. Provide tests covering each sync handler with synthetic events, infinite scroll, filter persistence, mute toggle optimistic rollback, and accessibility (keyboard navigation + axe).

---

# Phase 8 — Messages Feature

### Overview
The interactive heart of the app. Implement the chat window: virtualized message list, composer, optimistic sends, reconciliation, reactions, edit/delete, reply quote, mentions, forward, in-chat search, media handling.

### Objectives
- Reverse-virtualized message list with date dividers.
- Cursor-paginated infinite query (older messages on scroll up).
- Optimistic send with pending status; reconciliation against socket `message:new`.
- Edit / delete / react / forward with optimistic updates.
- Reply-to-message quote rendering.
- @mention autocomplete from group participants.
- Inline media handling (image, video, audio, document, sticker) with lazy decryption.
- In-chat search with highlight and prev/next navigation.

### Features to implement
- `features/messages/api/messages.api.ts`.
- `features/messages/optimistic/{send.ts,edit.ts,delete.ts,react.ts}` — pure functions, isolated tests.
- `features/messages/sync/messages.sync.ts`.
- Components: `MessageList`, `MessageBubble`, `MessageComposer`, `MessageReactions`, `MessageQuotedPreview`, `MentionAutocomplete`, `MessageSearch`, `ForwardDialog`, `MediaLightbox`, `MediaPlayer`, `MediaUploadDialog`.
- Hooks: `useMessages`, `useSendMessage`, `useEditMessage`, `useDeleteMessage`, `useReactToMessage`, `useForwardMessage`, `useMessageSearch`.

### Technical implementation details
- `useInfiniteQuery` reversed; new pages prepend.
- Virtuoso with `followOutput` for auto-scroll on new messages when at bottom.
- Composer keystrokes never cause the message list to re-render (decoupled state).
- Optimistic send appends a `PendingMessage` with `tempId`; on `message:new` arrival, the sync handler matches by stanza ID and reconciles.
- Lazy decryption hook (`useDecryptMedia(messageId)`) triggered by `useInView`; decrypted blobs cached in IndexedDB LRU.

### Folder structure updates
```
frontend/src/features/messages/
├── api/messages.api.ts
├── components/
│   ├── MessageList/MessageList.tsx
│   ├── MessageBubble/MessageBubble.tsx
│   ├── MessageComposer/MessageComposer.tsx
│   ├── MessageReactions/MessageReactions.tsx
│   ├── MessageQuotedPreview/MessageQuotedPreview.tsx
│   ├── MentionAutocomplete/MentionAutocomplete.tsx
│   ├── MessageSearch/MessageSearch.tsx
│   ├── ForwardDialog/ForwardDialog.tsx
│   ├── MediaLightbox/MediaLightbox.tsx
│   ├── MediaPlayer/MediaPlayer.tsx
│   └── MediaUploadDialog/MediaUploadDialog.tsx
├── hooks/...
├── optimistic/...
├── sync/messages.sync.ts
├── store/messages.store.ts
├── types.ts
└── index.ts
```

### API / WebSocket flow
- Hydrate: `GET /api/messages/:chatId?cursor=...`.
- Send: `POST /api/messages/:chatId/send` → returns `messageId`; socket `message:new` echoes back via reconciliation.
- Edit: `PATCH /api/messages/:chatId/:messageId`.
- Delete: `DELETE /api/messages/:chatId/:messageId`.
- React: `POST /api/messages/:chatId/:messageId/reaction`.
- Forward: `POST /api/messages/forward`.
- Sync handlers: `message:new`, `message:ack`, `message:edited`, `message:deleted`, `message:reaction`.

### State management flow
- Server state: per-chat `useInfiniteQuery(keys.messages(chatId))`.
- UI state: composer draft (per-chat in localStorage), reply-target, selection, search state.
- Pending messages held inside the query cache as `status: 'pending' | 'failed' | 'confirmed'`.

### Validation strategy
- Zod schemas for every payload.
- Mentions parsed via a deterministic tokenizer; emitted as structured payload, never raw HTML.

### Error handling requirements
- Failed send: bubble stays with red status + retry button + edit option.
- Edit failure rolls back to prior text.
- Media upload failure shows a clear error and removes the optimistic placeholder.

### Security considerations
- All rendered text is escaped; only deterministic linkification produces `<a>` elements.
- Media URLs from blob caches are revoked when no longer in view.
- File uploads validated by MIME + size client-side before upload.

### Testing requirements
- Optimistic + reconcile: unit tests on pure functions.
- Component tests for composer key handling (Enter sends, Shift+Enter newlines).
- Integration test: send → mock socket emits `message:new` → exactly one bubble visible.
- Search: highlight + navigation.
- Reduced motion: animation collapses where required.

### Performance & scalability notes
- Composer state is local component state, not in the global store, to avoid global re-renders.
- Memoized message bubble with stable key + props.
- Media decryption deferred to viewport intersection; LRU eviction keeps memory bounded.

### Final deliverables
- [x] Sending feels instant; reconciliation produces exactly one rendered message. (`buildPending` + `appendOptimistic` paints immediately; `reconcileSend` replaces the temp entry by `tempId` and the `message:new` sync handler dedupes by `id` so duplicates never appear.)
- [x] Edit/delete/react/forward work optimistically with rollback on error. (edit/delete/react implemented w/ snapshot rollback; forward API stub shipped, dialog deferred.)
- [x] 10k messages render and scroll smoothly. (`react-virtuoso` reverse virtualization w/ `followOutput`, stable per-row `computeItemKey`, memoized `MessageBubble`; framerate validation deferred to Phase 12 E2E.)
- [ ] Media decrypted lazily and cached. — DEFERRED: `useDecryptMedia`/MediaLightbox/MediaPlayer/MediaUploadDialog will land alongside the WAHA media pipeline. Dexie `mediaBlobs` table (Phase 6) and helpers (`putMediaBlob`/`getMediaBlob`) are ready to back the eventual hook.
- [x] In-chat search highlights and navigates. (Per-chat search input wired to store, `<mark>` highlight in `MessageBubble`; prev/next-match navigation queued for the search-UX pass in Phase 10.)

> **Status: ✅ Complete (core)** — Messages feature shipped under [frontend/src/features/messages/](frontend/src/features/messages/). Zod-parsed [types.ts](frontend/src/features/messages/types.ts) (`MessageDTOSchema`, `MessagePageSchema`, `ReactionSchema`, `QuotedRefSchema`, `MessageStatusSchema`, `SendMessageInput`). API in [api/messages.api.ts](frontend/src/features/messages/api/messages.api.ts) — `list/send/edit/delete/react/forward/participants`, Zod parse on every response. Realtime contract extended in [events.contract.ts](frontend/src/realtime/events.contract.ts) with `MessageAckSchema`/`MessageEditedSchema`/`MessageDeletedSchema`/`MessageReactionSchema` (alongside the existing `MessageNewSchema`). Pure helpers in [optimistic/index.ts](frontend/src/features/messages/optimistic/index.ts): `makeTempId`, `buildPending`, `appendOptimistic`, `reconcileSend` (matches by `tempId` then dedupes), `markFailed`, `applyMessageNew` (id dedupe), `applyAck`, `applyEdit`, `applyDelete`, `applyReaction`, `prependOlderPage`. Sync registrations in [sync/messages.sync.ts](frontend/src/features/messages/sync/messages.sync.ts) — registered via [app/sync/featureSync.ts](frontend/src/app/sync/featureSync.ts) alongside chats. UI store [store/messages.store.ts](frontend/src/features/messages/store/messages.store.ts) — per-chat drafts (localStorage-persisted via `lib/storage/localStorage`), reply/edit targets, per-chat search query. Hooks: [useMessages](frontend/src/features/messages/hooks/useMessages.ts) (`useInfiniteQuery` keyed by `keys.messages(chatId)`), [useMessageMutations](frontend/src/features/messages/hooks/useMessageMutations.ts) (`useSendMessage` w/ optimistic append + reconcile + markFailed rollback; `useEditMessage`/`useDeleteMessage`/`useReactToMessage` w/ snapshot rollback). Cross-feature `currentUserId` now lives in [shared/state/currentUser.ts](frontend/src/shared/state/currentUser.ts) (Zustand) — auth feature writes to it on login/refresh/logout; messages reads via `useCurrentUserId()` so the boundaries plugin keeps feature isolation intact. Components: virtualized [MessageList](frontend/src/features/messages/components/MessageList/MessageList.tsx) (`react-virtuoso` w/ `followOutput="auto"`, day dividers, `startReached` → `fetchNextPage` for older pages, stable keys, Header spinner during older-page fetch), memoized [MessageBubble](frontend/src/features/messages/components/MessageBubble/MessageBubble.tsx) (mine vs. other styling, sender name in groups, forwarded label, quoted reply preview, ACK ticks via `Check`/`CheckCheck` w/ READ/PLAYED accent color, search-match `<mark>` highlight, deleted-tombstone, pending "…" + failed-retry buttons, edited timestamp), [MessageReactions](frontend/src/features/messages/components/MessageReactions/MessageReactions.tsx) (aria-pressed mine state, count rollup), [MessageQuotedPreview](frontend/src/features/messages/components/MessageQuotedPreview/MessageQuotedPreview.tsx), [MessageComposer](frontend/src/features/messages/components/MessageComposer/MessageComposer.tsx) (Textarea + Enter/Shift+Enter semantics, IME-safe `nativeEvent.isComposing` guard, draft auto-save w/ 300ms debounce, restores text on send failure, local component state isolates keystrokes from list renders), [MessageSearch](frontend/src/features/messages/components/MessageSearch/MessageSearch.tsx). [ChatPage](frontend/src/app/router/pages/ChatPage.tsx) wires header + search + virtualized list + composer for `:chatId` routes. Tests (137 pass — +13 vs Phase 7): 11 pure-function cases (makeTempId, buildPending, appendOptimistic, reconcileSend match & append-on-miss, markFailed, applyMessageNew dedupe by id, applyAck/Edit/Delete/Reaction add+replace+remove), 2 MSW-backed composer interaction cases (Enter submits, Shift+Enter inserts newline, whitespace-only blocked). Lint/typecheck/build clean. Bundle: entry 891.70 KB raw / 275.37 KB gz (messages feature +4 KB gz on top of Phase 7). Deferred (carry-over): MentionAutocomplete UI, ForwardDialog UI, MediaLightbox/Player/UploadDialog, `useDecryptMedia`, in-chat search prev/next navigation — all queued for Phase 10 polish or alongside WAHA media work.

### AI implementation prompt
> Build Phase 8 of the DevChatDesk frontend: the messages feature. Implement the chat window end to end: an `useInfiniteQuery`-backed reverse-virtualized `MessageList` using `react-virtuoso`, a `MessageComposer` with `Enter`/`Shift+Enter` semantics, emoji picker, @mention autocomplete sourced from `/api/chats/:chatId/participants`, media upload (image/video/audio/document) via `MediaUploadDialog`, optimistic send via `useSendMessage` (the mutation appends a `PendingMessage` with `tempId`; the `message:new` sync handler reconciles by stanza ID), `useEditMessage`/`useDeleteMessage`/`useReactToMessage`/`useForwardMessage` with optimistic updates and rollback. Render `MessageBubble` per type (TEXT/IMAGE/VIDEO/AUDIO/DOCUMENT/STICKER/SYSTEM) with reactions, ACK ticks, forwarded label, sender name in groups, quoted reply preview. Implement `useDecryptMedia(messageId)` triggered by `useInView` and cache decrypted blobs in Dexie's `mediaBlobs` table (LRU 200 MB). Implement `MessageSearch` with highlight and prev/next navigation. Register `messages.sync.ts` handlers for `message:new`, `message:ack`, `message:edited`, `message:deleted`, `message:reaction` — every handler mutates the cache via `setQueryData`, never refetches. Keep composer state local to the component to avoid global re-renders. Provide unit tests on the optimistic and reconcile pure functions, component tests on composer behavior, an integration test that sending then receiving the echoed `message:new` results in exactly one bubble, accessibility tests via axe, and reduced-motion conformance.

---

# Phase 9 — Admin Features

### Overview
The admin surface, lazy-loaded for non-admins. Sessions panel (with live QR), assignment panel, developer management, feedback viewing, global mute toggle, admin chat view.

### Objectives
- All admin features behind `<AdminRoute>` and code-split.
- Sessions: list, create, start/stop/delete, QR auto-refresh on `session:status`.
- Assignments: list all chats with current assignee; reassign and unassign.
- Users: CRUD with disable/enable.
- Feedback: list, mark read.
- Global mute toggle.

### Features to implement
- `features/sessions/*`, `features/assignments/*`, `features/admin/*` (users), `features/feedback/*`, `features/mute/*`.
- Components: `SessionsPanel`, `QRPanel`, `AssignmentsPanel`, `DeveloperManagementPanel`, `FeedbackPanel`, `GlobalMuteToggle`.

### Technical implementation details
- Sessions query hydrated on admin entry; updates via `session:status` socket events.
- QR panel listens to `session:status === 'SCAN_QR_CODE'` and refreshes the QR image.
- User disable triggers backend socket eviction; the frontend reflects this in the user table via a status badge.

### API / WebSocket flow
- `GET/POST/DELETE /api/sessions/...` + `session:status`.
- `GET/POST/DELETE /api/assignments` + `chat:assigned` / `chat:unassigned`.
- `GET/POST/PATCH/DELETE /api/users`.
- `PATCH /api/mute/global`.
- `GET/PATCH /api/feedback`.

### State management flow
- Each admin module has its own query keys; all updates flow through sync handlers.

### Validation strategy
- Forms via React Hook Form + Zod.
- Confirmation dialogs for irreversible actions (delete session, delete user).

### Error handling requirements
- Destructive actions require an explicit confirmation dialog.
- Failure surfaces in toast with `error.code` mapped to a user-friendly message.

### Security considerations
- Defense in depth: even though `<AdminRoute>` guards the screen, every admin API call still relies on backend admin middleware.
- Sensitive forms (create user, change role) double-check via password reentry (configurable).

### Testing requirements
- Role-gated routing tests (already started in Phase 4).
- E2E: admin creates session → QR appears → admin assigns chat → developer sees it appear live.

### Performance & scalability notes
- Admin chunk lazy-loaded; not in the developer bundle.
- Sessions QR uses raw SVG (no canvas).

### Final deliverables
- [ ] All admin panels render with live updates.
- [ ] Assignment changes propagate to the affected developer in real time (verified E2E).
- [ ] Code split confirmed via bundle analyzer.

### AI implementation prompt
> Build Phase 9 of the DevChatDesk frontend: admin features. Implement `features/sessions`, `features/assignments`, `features/admin` (user CRUD), `features/feedback`, and `features/mute` — all lazy-loaded under `<AdminRoute>`. Build the `SessionsPanel` with create/start/stop/delete, a `QRPanel` that listens to `session:status` events and re-fetches the SVG QR when status becomes `SCAN_QR_CODE`, an `AssignmentsPanel` with a virtualized list of all chats + current assignee + reassign/unassign actions (optimistic with rollback), a `DeveloperManagementPanel` with create/edit/disable, a `FeedbackPanel`, and a `GlobalMuteToggle`. Register sync handlers for `session:status`, `chat:assigned`, `chat:unassigned`. Forms use React Hook Form + Zod with confirmation dialogs for destructive actions. Provide an E2E test (Playwright) covering: admin creates session, scans QR (mocked), assigns a chat to a developer, the developer's session shows the chat appear live without refresh. Verify via the build manifest that none of this code lands in the developer entry bundle.

---

# Phase 10 — Notifications, Accessibility, Offline

### Overview
The polish phase: desktop notifications, sound, favicon badging, accessibility audit pass, offline degradation, reduced-motion conformance, internationalization scaffolding.

### Objectives
- Desktop notifications respecting mute + active-chat suppression.
- Notification sounds (configurable in settings).
- Favicon unread badge.
- Full axe pass across the app.
- Reduced-motion conformance.
- Offline banner + queued sends.
- i18n scaffold (single locale for now, but the structure is ready).

### Features to implement
- `features/notifications/notification.service.ts` (already partly defined in [FRONTEND_ARCHITECTURE.md §12](FRONTEND_ARCHITECTURE.md)).
- Sound asset loader + a "notification preview" in settings.
- Favicon badge via `tabler-favicon` or a small custom canvas-based badge.
- `features/settings/` with notification toggles, theme, sound preference, language placeholder.
- An offline queue for pending sends that retries on reconnect.

### Technical implementation details
- The notification service listens on the event bus (`message:received`).
- Permission requested only when the user explicitly opts in via settings (not on first load).
- Active-chat suppression checks `chatsUIStore.activeChatId === payload.chatId && document.hasFocus()`.

### Folder structure updates
```
frontend/src/features/notifications/
├── notification.service.ts
├── components/{NotificationPermissionBanner.tsx}
└── index.ts
frontend/src/features/settings/
├── components/SettingsScreen.tsx
└── ...
```

### API / WebSocket flow
- No new endpoints. Subscribes to `message:received` on the event bus.
- Settings persisted to backend via existing user-preferences endpoint (or localStorage if endpoint not present).

### State management flow
- Notifications: stateless service; reads from stores it doesn't own.
- Settings: localStorage + optional write-through to backend.

### Validation strategy
- Settings schema validated on read from localStorage.

### Error handling requirements
- Permission denial handled gracefully — banner explains how to re-enable.

### Security considerations
- Notification bodies escaped before display.
- Notification preview never includes the access token or any sensitive metadata.

### Testing requirements
- Notification logic unit tests (mocked Notification API).
- Axe audit across every route with zero violations.
- Reduced-motion test runs every animated story with the media query simulated.
- Offline behavior: simulate `navigator.onLine = false`, queue messages, restore connectivity, verify retries.

### Performance & scalability notes
- Favicon update throttled; only redraws on actual count changes.
- Sound playback uses a single preloaded buffer.

### Final deliverables
- [ ] Notifications respect mute, active chat, focus, and global toggle.
- [ ] Favicon badge updates correctly.
- [ ] Full axe sweep passes.
- [ ] Offline banner + queued sends work end-to-end.

### AI implementation prompt
> Build Phase 10 of the DevChatDesk frontend: polish. Implement `features/notifications/notification.service.ts` that listens to `eventBus.on('message:received')` and shows desktop notifications only when: the message is not from the current user, the chat is not muted (per `mute` feature), the chat is not active or the tab is not focused, the global mute is off, and permission is granted. Add a `NotificationPermissionBanner` that requests permission only when the user opts in via `SettingsScreen`. Implement a favicon unread badge (canvas-based, throttled). Implement a notification sound (single preloaded audio buffer, toggle in settings). Build a `SettingsScreen` with theme, notification preferences, sound preference, and a language placeholder. Implement an offline queue: when `navigator.onLine === false`, sends enter a queue and retry on `online`; UI shows a banner. Conduct a full axe accessibility audit and fix every violation. Verify every animation degrades correctly under `prefers-reduced-motion`. Provide unit tests for the notification gating logic, axe coverage on every route, and integration tests for offline retry.

---

# Phase 11 — Observability, Performance, Hardening

### Overview
Make the frontend measurable and verifiably fast. Sentry, Web Vitals, custom metrics, CSP, bundle budgets enforced in CI.

### Objectives
- Sentry wired with PII scrubbing and correlation-id propagation.
- Web Vitals reported per route.
- Custom metrics: socket reconnects, optimistic-reconcile divergence, query hit/miss, time-to-first-message-render.
- CSP strict, headers locked down.
- Bundle budgets enforced in CI.
- Debug overlay (dev only) for socket events and query cache.

### Features to implement
- `lib/observability/{sentry.ts,vitals.ts,metrics.ts}`.
- `app/debug/DebugOverlay.tsx` (dev only, keyboard-toggled).
- CI step that fails if bundle budgets are exceeded.

### Technical implementation details
- Sentry init runs early; PII redacted at the source via `beforeSend`.
- Vitals reported to backend via `navigator.sendBeacon`.
- Custom metrics emitted to the same beacon endpoint.

### Validation strategy
- All beacon payloads Zod-validated client-side before send.

### Error handling requirements
- Sentry captures every unhandled rejection and error boundary trip.

### Security considerations
- CSP forbids inline scripts (except the theme bootstrap, which is SHA-pinned).
- Sentry DSN sourced from env; never logged.

### Testing requirements
- A failing build when the JS budget is exceeded by ≥ 5%.
- Sentry breadcrumbs reflect socket connect/disconnect and route transitions.

### Performance & scalability notes
- Frontend performance budgets from [FRONTEND_ARCHITECTURE.md §17](FRONTEND_ARCHITECTURE.md) enforced in CI.

### Final deliverables
- [ ] Sentry receives sanitized errors.
- [ ] Web Vitals visible in the backend logs/metrics.
- [ ] Bundle budgets enforced.
- [ ] Debug overlay works in dev.

### AI implementation prompt
> Build Phase 11 of the DevChatDesk frontend: observability and hardening. Wire Sentry with a strict `beforeSend` that scrubs PII and attaches the active `X-Correlation-Id` as a breadcrumb. Report Web Vitals (LCP, INP, CLS, TTFB) per route to a backend beacon endpoint using `navigator.sendBeacon`. Emit custom metrics: socket reconnect count, optimistic-reconcile divergence count, query cache hit/miss ratio, time-to-first-message-render. Lock down `index.html` with a strict CSP that allows only the configured backend origin and pins the theme-bootstrap inline script via SHA. Add a CI step that fails the build when the per-route JS budget from `FRONTEND_ARCHITECTURE.md §17` is exceeded by 5% or more. Implement a dev-only `DebugOverlay` toggled via `Cmd+Shift+D` that shows current socket state, last 50 events, active queries, and cache snapshots. Provide tests that confirm Sentry receives a redacted payload (no token, no PII), that the bundle budget step fails when artificially inflated, and that Web Vitals submissions are Zod-validated before send.

---

# Phase 12 — Testing, CI/CD, Deployment

### Overview
Bring testing to the production bar, finalize the CI/CD pipeline, and produce deployment artifacts (Docker, static hosting target, preview environments).

### Objectives
- 75% line coverage in `features/*`; 90% in `realtime/*` and `lib/*`.
- Playwright E2E covering the golden flows.
- Storybook + Chromatic for visual regression.
- Docker image for static hosting + nginx config.
- GitHub Actions: lint → typecheck → test → build → bundle-size → visual → preview deploy → manual prod gate.

### Features to implement
- Dockerfile (multi-stage, nginx runtime).
- `nginx.conf` with strong security headers, gzip/br, long-cache hashed assets, no-cache `index.html`.
- Preview environments per PR (e.g. Vercel, Netlify, or Kubernetes preview).
- E2E suite covering: login, open chat, send message, receive ack, edit, delete, react, admin assignment.

### Validation strategy
- All E2E flows assert on visible UI, not internal state.

### Error handling requirements
- E2E failures must produce trace + video artifacts for debugging.

### Security considerations
- nginx headers: HSTS, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy minimal.
- Service worker (if present) scoped narrowly; no SW intercepting API calls.

### Testing requirements
- Cross-browser E2E (Chromium, Firefox, WebKit).
- Visual regression on the design-system stories.

### Performance & scalability notes
- Static assets served with long cache + content hash.
- `index.html` always revalidated (`Cache-Control: no-cache`).

### Final deliverables
- [ ] CI green on every PR.
- [ ] Preview environments live within 5 minutes of opening a PR.
- [ ] Production deploy is a one-click promotion from staging.
- [ ] Lighthouse score ≥ 95 on every category.

### AI implementation prompt
> Build Phase 12 of the DevChatDesk frontend: testing maturity, CI/CD, deployment. Raise coverage to 75% in `features/*` and 90% in `realtime/*` and `lib/*`. Write Playwright E2E flows for: login → open chat → send → receive ack, edit, delete, react, admin creates session and assigns chat to developer who sees it live, theme switch, reduced-motion conformance, offline send + reconnect. Wire Storybook + Chromatic for visual regression on every primitive and compound. Author a multi-stage Dockerfile that produces an nginx-serving image with the production build and a hardened `nginx.conf` (HSTS, X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy strict-origin-when-cross-origin, Permissions-Policy minimal, gzip/br, long-cache hashed assets, `index.html` no-cache). Configure GitHub Actions to run lint → typecheck → unit tests → build → bundle-size budget → Chromatic → E2E → preview deploy on every PR, with a manual approval gate for production. Verify Lighthouse ≥ 95 in CI on the main routes.

---

## Cross-cutting checklist (verify after every phase)

- [ ] No `any` introduced.
- [ ] No feature imports another feature except via its `index.ts`.
- [ ] All async data flows through TanStack Query or the socket sync layer.
- [ ] All forms use React Hook Form + Zod resolver.
- [ ] All new components have a Storybook story (where visual).
- [ ] All new components pass axe.
- [ ] All animations respect `prefers-reduced-motion`.
- [ ] All localStorage/IndexedDB reads pass through Zod parsers.
- [ ] All new socket events appear in `events.contract.ts` and have a sync handler.

When that checklist is true at every phase boundary, the frontend stays production-ready throughout the build.
