# DevDeskChat Frontend — Master Context

> Source of truth for an AI agent (or new engineer) joining the project. Describes the **app intent**, **architecture rules**, **boot sequence**, and **current build state**. No code. Pair with module files in `frontend/docs/modules/` for per-module detail.

---

## 1. What this app is

DevDeskChat is a multi-tenant chat desk for developers. An admin connects backend chat sessions (e.g. WhatsApp via the backend's session abstraction), assigns chats to developers, and developers respond from a unified inbox. Admins also manage users, view feedback, and toggle mute. End users see live updates without manual refresh; the UI degrades gracefully when offline.

The frontend is one of two siblings in this repository; the backend lives separately (see `BACKEND_*.md` at repo root). The frontend never assumes anything is "live" unless it received either an HTTP confirmation or a socket event from the backend — server is authoritative.

## 2. High-level intent

- **One socket per session, lives above the router.** Route changes never tear down the connection.
- **Server state via TanStack Query; UI state via Zustand; persistent snapshots via IndexedDB.** The boundaries are strict.
- **Optimistic mutations everywhere user input lands**, with deterministic reconcile against backend echoes.
- **Strict TypeScript, branded IDs, Zod parsing at every network boundary.** No `any`. No raw `as` outside type guards and Zod parsers.
- **Feature-modular folders** with `eslint-plugin-boundaries` enforcing that cross-feature imports go through `index.ts` only.
- **Accessibility first** — every primitive ships keyboard support, focus rings, axe-clean stories.
- **Production-ready at every phase boundary** — the app must build, lint, typecheck, and test green after every milestone.

## 3. Technology stack

| Layer | Technology |
|---|---|
| Framework | React 19 (StrictMode) |
| Build | Vite 6 |
| Language | TypeScript 5.7, strict mode + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` |
| Runtime validation | Zod |
| State (planned) | TanStack Query v5 (server state), Zustand (UI state), Dexie/IndexedDB (persistence) |
| Real-time (planned) | Socket.IO client, single instance |
| Routing (planned) | React Router 7 data routers |
| Styling | Tailwind v4 (`@tailwindcss/vite`) + CSS variable design tokens (light / dark / high-contrast) |
| Primitives | Radix UI + `class-variance-authority` + `clsx` + `tailwind-merge` |
| Animation | Framer Motion + `usePrefersReducedMotion` fallbacks |
| Icons | `lucide-react` (curated re-exports from `design-system/icons`) |
| Storybook | Storybook 8 + `@storybook/react-vite` + `@storybook/addon-a11y` |
| Test | Vitest 3 + @testing-library/react + jsdom + `vitest-axe` matchers; Playwright planned for E2E |
| Lint | ESLint 9 flat config + typescript-eslint strict-type-checked + react-hooks + jsx-a11y + boundaries |
| CI | GitHub Actions — lint → typecheck → test → build |

## 4. Folder shape (target)

```
frontend/
├── src/
│   ├── main.tsx                    # entry
│   ├── App.tsx                     # boot orchestrator
│   ├── app/
│   │   ├── providers/AppProviders.tsx
│   │   ├── errors/AppErrorBoundary.tsx
│   │   ├── ui/BootGate.tsx
│   │   └── router/                 # populated in Phase 4
│   ├── features/<feature>/         # auth, chats, messages, sessions, etc.
│   │   ├── api/                    # axios-backed module
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── store/                  # Zustand slice (UI ephemera only)
│   │   ├── sync/                   # socket → cache bridge
│   │   ├── types.ts
│   │   └── index.ts                # public API (cross-feature gateway)
│   ├── realtime/                   # socket singleton, event bus, sync controller
│   ├── design-system/              # tokens, theme, primitives, compounds, motion, icons
│   ├── lib/                        # http, storage, env, format, time
│   ├── shared/                     # branded IDs, utils (cn), generic hooks, constants
│   ├── styles/                     # globals.css, tailwind.css, reset.css
│   └── tests/
├── public/                         # theme-bootstrap.js (no-FOUC) + static assets
├── .storybook/                     # Storybook 8 config (main.ts, preview.ts)
├── docs/                           # this directory
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── eslint.config.js
└── package.json
```

## 5. Import rules (enforced by ESLint)

`eslint-plugin-boundaries` classifies each file by element type:

- `root` — `src/main.tsx`, `src/App.tsx`
- `app` — `src/app/**`
- `feature` — `src/features/<name>/**`
- `realtime` — `src/realtime/**`
- `design-system` — `src/design-system/**`
- `lib` — `src/lib/**`
- `shared` — `src/shared/**`
- `styles` — `src/styles/**`
- `tests` — `src/tests/**`

Allowed dependencies:

| From | May import |
|---|---|
| `root` | `app`, `feature` (via `index.ts`), `design-system`, `lib`, `shared`, `realtime`, `styles`, `root` |
| `app` | `app`, `feature` (via `index.ts`), `design-system`, `lib`, `shared`, `realtime`, `styles` |
| `feature/X` | same `feature/X`, `design-system`, `lib`, `shared`, `realtime` — and other features ONLY via their `index.ts` |
| `design-system` | `design-system`, `lib`, `shared` |
| `lib` | `lib`, `shared` |
| `shared` | `shared` |
| `realtime` | `realtime`, `lib`, `shared` |
| `styles` | `styles` |

Violations fail `npm run lint`.

## 6. Application boot sequence (target)

```
index.html
  └─ <script src="/theme-bootstrap.js">         # syncs data-theme + data-theme-preference before paint (Phase 2)
main.tsx
  └─ <StrictMode>
       └─ <App>
            └─ <AppErrorBoundary>
                 └─ <AppProviders>
                      ├─ <QueryProvider>       # TanStack Query client placeholder (Phase 6)
                      ├─ <ThemeProvider>       # ✅ Phase 2 — applies data-theme, listens to OS color scheme
                      ├─ <AuthProvider>        # silent refresh placeholder (Phase 3)
                      ├─ <SocketProvider>      # opens socket AFTER auth:ready (Phase 5)
                      ├─ <SyncController>      # registers per-feature sync handlers (Phase 5)
                      └─ <ToastProvider>       # ✅ Phase 2 — Radix Toast viewport + useToast() context
                           └─ <BootGate> | <Styleguide>   # `/__styleguide` dev path renders the styleguide; Phase 4 swaps in <AppRouter>
```

The socket lives above the router intentionally — route changes must never close the connection.

## 7. State management model (target)

Three strict layers:

1. **Server state** — TanStack Query cache. Keyed by branded IDs. Mutated by HTTP responses and socket events ONLY. Sync handlers use `setQueryData`; never `invalidateQueries`/refetch.
2. **UI state** — Zustand. Per-feature slices. Holds ephemera like active chat ID, composer drafts, filter state. Never round-trips to the server.
3. **Persistent state** — IndexedDB (Dexie). Hydration writes seed data into the query cache on boot for instant paint. Network response is canonical and overwrites.

## 8. Real-time contract (target)

Single Socket.IO connection per session, constructed once as a module-level singleton, wrapped in a React context. Opened after `auth:ready` event on the bus; closed on `auth:logged-out`. Reconnect uses exponential backoff capped at 30 s, surfaces "Reconnecting…" banner. On reconnect, missed events are reconciled via `GET /api/sync?since=<seq>`.

Every event payload (in and out) is validated through Zod schemas mirrored from the backend.

## 9. Security baseline

- Access token in memory only — never `localStorage` / `sessionStorage`.
- Refresh via httpOnly cookie + `withCredentials: true`.
- Strict CSP `<meta>` on `index.html`; tightened in Phase 11.
- All rendered text is escaped; only deterministic linkification produces anchor elements.
- IndexedDB cleared on logout.
- No PII in observability beacons.

### Backend integration (canonical cross-process contract)

The backend (`../../backend/`) is the single API + WebSocket host. Authoritative contract lives in [`backend/docs/context.md`](../../backend/docs/context.md) §12a "Frontend integration contract" — read that alongside this file.

| Concern | Value |
|---|---|
| Backend dev port | `3005` (`backend/.env.example` `PORT`) |
| Frontend dev port | `5173` (Vite default) |
| Backend CORS allow-list (dev default) | `http://localhost:5173` |
| `VITE_API_BASE_URL` (dev) | `http://localhost:3005` |
| `VITE_SOCKET_URL` (dev) | `http://localhost:3005` |
| Error envelope | `{ error: { code, message, correlationId, details? } }` — frontend's `AppApiError` (Phase 3) decodes exactly this shape |
| Correlation header | `X-Correlation-Id` (case-insensitive); backend echoes a valid UUID or generates one. Clients must read the echoed value |
| Cookies | `credentials: true` CORS both sides; refresh cookie is httpOnly (Phase 3). Frontend never reads cookies from JS |
| Health probes | `GET /health/live` (cheap), `GET /health/ready` (terminus DB+Redis) — do not call from the UI on every render |

Endpoints the frontend's later phases assume (auth, chats, messages, sessions, sync) are not yet implemented on the backend. They land in backend phases 3+. The phase-ordered gap is expected; each frontend feature blocks behind its own phase boundary until the matching backend endpoint exists.

Backend invariants the frontend depends on:
- Envelope shape + `code` constants stay stable.
- `synchronize: false` — no ad-hoc schema drift.
- Stack traces never leave the server.
- Success payloads are raw bodies (no wrapping envelope) and validated per-feature by Zod on the frontend side.

## 10. Phase status (progressive build)

| Phase | Theme | Status |
|---|---|---|
| **1** | Foundation: project scaffold, providers shell, typing, env | ✅ Done |
| **2** | Design system | ✅ Done |
| **3** | HTTP + auth | ⏳ Pending |
| **4** | Routing + guards | ⏳ Pending |
| **5** | Real-time core | ⏳ Pending |
| **6** | State foundation | ⏳ Pending |
| **7** | Chats feature | ⏳ Pending |
| **8** | Messages feature | ⏳ Pending |
| **9** | Admin features | ⏳ Pending |
| **10** | Notifications, a11y, offline | ⏳ Pending |
| **11** | Observability, perf, hardening | ⏳ Pending |
| **12** | Testing, CI/CD, deployment | ⏳ Pending |

Detailed plan for every phase: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../FRONTEND_IMPLEMENTATION_PLAN.md) at repo root.
Architectural reference: [`FRONTEND_ARCHITECTURE.md`](../../FRONTEND_ARCHITECTURE.md).
Feature catalog: [`FRONTEND_FEATURES_OVERVIEW.md`](../../FRONTEND_FEATURES_OVERVIEW.md).

## 11. Current build state (after Phase 2)

What exists and runs today:

### From Phase 1 (foundation)
- React 19 + Vite 6 + TS strict project bootstraps to a themed shell.
- `AppErrorBoundary` wraps the tree and surfaces failures via a DOM event (`app:error`) — Sentry wired later in Phase 11.
- `AppProviders` composes six providers in the correct order; `ThemeProvider` and `ToastProvider` are now real (Phase 2). The other four remain transparent placeholders until their respective phases.
- `BootGate` renders a `role="status"` loading indicator.
- `lib/env.ts` Zod-parses `import.meta.env` at module load; failures throw.
- `shared/types/ids.ts` provides branded `UserId`, `ChatId`, `MessageId`, `SessionId` and `to*` constructors with a shared validation regex.
- ESLint flat config enforces the boundaries policy in section 5.
- GitHub Actions workflow at repo root `.github/workflows/frontend.yml` runs lint → typecheck → test → build on every PR touching `frontend/**`.

### From Phase 2 (design system)
- **Tokens** — `design-system/tokens/themes/{light,dark,highContrast}.css` define every CSS variable (color/border/shadow/space/type/radius/motion). TypeScript pointer modules (`colors.ts`, `typography.ts`, `spacing.ts`, `radius.ts`, `motion.ts`, `shadow.ts`) re-export each token as `var(--…)` strings for use in code.
- **Tailwind v4** — wired via `@tailwindcss/vite`; `src/styles/tailwind.css` imports the theme files and binds them through `@theme` so Tailwind utilities resolve to live CSS variables. `src/styles/reset.css` applies token-driven globals.
- **Theme** — `design-system/theme/ThemeProvider.tsx` exposes `useTheme()` with `preference` (`light | dark | high-contrast | system`), `resolved` (`light | dark | high-contrast`), and `setPreference`. Preference persists in `localStorage` under `devdesk:theme`. `public/theme-bootstrap.js` runs synchronously in `<head>` to set `data-theme` + `data-theme-preference` before React mounts, eliminating FOUC. Script is static (no inline) so the existing CSP stays intact; SHA-pinning deferred to Phase 11.
- **Motion** — `design-system/motion/` exports Framer Motion variants (`fadeIn`, `slideUp`, `slideDown`, `popIn`, `staggerList`, `instant`), `transitions` presets, and `usePrefersReducedMotion()`. The `instant` variant is the canonical collapse target for reduced motion.
- **Primitives** — fifteen Radix-backed components live under `design-system/primitives/<Name>/` with CVA-driven variants: Button, Input, Textarea, Dialog, Popover, Tooltip, Dropdown, Switch, Checkbox, Tabs, Toast, Avatar, Badge, Spinner, Skeleton. `ToastProvider` + `useToast()` is the app-level toast surface (wired into `AppProviders`).
- **Compounds** — `design-system/compounds/` ships EmptyState, SectionHeader, Tag, IconButton.
- **Icons** — `design-system/icons/index.ts` curates the `lucide-react` icons the app actually uses. New icons get added here, not imported ad hoc.
- **Styleguide** — `app/ui/Styleguide.tsx` renders every primitive and compound. Mounted at `/__styleguide` via a path check in `App.tsx`; only active when `import.meta.env.DEV` is true. Replaced by `<AppRouter>` in Phase 4 (the route will move into the router table).
- **Storybook 8** — `.storybook/{main.ts,preview.ts}` configured with `addon-a11y`, a theme toolbar (light/dark/high-contrast), and a story per primitive + compound. Scripts: `npm run storybook`, `npm run build-storybook`.
- **Shared utilities** — `shared/utils/cn.ts` exports `cn(...inputs)` (clsx + tailwind-merge); every primitive uses it.
- **Tests** — 42 pass:
  - Primitive RTL coverage: Button (click + isLoading + axe), Input (aria-invalid + axe), Switch (toggle + axe), Checkbox (keyboard + axe), Dialog (open + Escape close), Toast (push + render).
  - `ThemeProvider` updates `data-theme` and persists preference.
  - `usePrefersReducedMotion` collapses to false/true based on `matchMedia`.
  - `tokens/contrast.test.ts` parses each theme CSS file and asserts WCAG AA contrast (4.5:1, or 3:1 for `fg-muted`) for seven fg/bg pairs across all three themes — 21 assertions total.
- **Test setup** — `src/tests/setup.ts` extends `expect` with `vitest-axe` matchers and stubs `window.matchMedia` for jsdom. `src/tests/vitest-axe.d.ts` augments Vitest's `Assertion` interface.

### Known deviations (Phase 2)
- Initial JS bundle is 386.64 KB raw / 112.52 KB gzipped — over the `FRONTEND_ARCHITECTURE.md §17` target of 250 KB initial JS. Admin/feature code-splitting lands in Phase 4 (router) and Phase 9 (admin chunk); the budget assertion in CI is wired in Phase 11.
- CSP still allows `style-src 'unsafe-inline'`; tightened in Phase 11 alongside SHA-pinning for the theme bootstrap.
- Chromatic visual regression / per-story axe sweep deferred to Phase 12.

Module-level detail for the built pieces lives in [`modules/`](modules/).

## 12. How to use these docs

- **Adding a new feature?** Read this file first, then the module file for the feature being touched (if it exists). Add a new `modules/<feature>.md` only when actual code for that feature lands.
- **Editing a module?** Update the corresponding `modules/<name>.md` in the same change-set so docs never drift from code.
- **A module file is missing?** That module hasn't been built yet. Do not extrapolate from the architecture/plan documents — those describe intent, not current state. Implement the module first, then document.
- **The progressive rule:** docs grow only when code grows. An empty stub folder is not a module yet; it gets a doc when it has real behavior.
