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
| Styling (planned) | Tailwind v4 + CSS variable design tokens |
| Animation (planned) | Framer Motion + reduced-motion fallbacks |
| Test | Vitest 3 + @testing-library/react + jsdom; Playwright planned for E2E |
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
│   ├── design-system/              # tokens, primitives, compounds, motion
│   ├── lib/                        # http, storage, env, format, time
│   ├── shared/                     # branded IDs, generic hooks, constants
│   ├── styles/
│   └── tests/
├── public/
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
main.tsx
  └─ <StrictMode>
       └─ <App>
            └─ <AppErrorBoundary>
                 └─ <AppProviders>
                      ├─ <QueryProvider>      # TanStack Query client (Phase 6)
                      ├─ <ThemeProvider>      # applies data-theme (Phase 2)
                      ├─ <AuthProvider>       # silent refresh on mount (Phase 3)
                      ├─ <SocketProvider>     # opens socket AFTER auth:ready (Phase 5)
                      ├─ <SyncController>     # registers per-feature sync handlers (Phase 5)
                      └─ <ToastProvider>      # Phase 2
                           └─ <AppRouter>     # routing starts AFTER providers ready (Phase 4)
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

## 10. Phase status (progressive build)

| Phase | Theme | Status |
|---|---|---|
| **1** | Foundation: project scaffold, providers shell, typing, env | ✅ Done |
| **2** | Design system | ⏳ Pending |
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

## 11. Current build state (after Phase 1)

What exists and runs today:

- React 19 + Vite 6 + TS strict project bootstraps to a blank shell.
- `AppErrorBoundary` wraps the tree and surfaces failures via a DOM event (`app:error`) — Sentry wired later in Phase 11.
- `AppProviders` composes six placeholder providers in the correct order; real implementations replace each placeholder in its respective phase.
- `BootGate` renders a `role="status"` loading indicator.
- `lib/env.ts` Zod-parses `import.meta.env` at module load; failures throw.
- `shared/types/ids.ts` provides branded `UserId`, `ChatId`, `MessageId`, `SessionId` and `to*` constructors with a shared validation regex.
- All feature folders, plus `realtime/` and `design-system/`, exist as empty modules with `export {};` placeholder so import paths resolve immediately when later phases land.
- ESLint flat config enforces the boundaries policy in section 5.
- Vitest test suite passes (7 tests across App render, env parsing, error boundary).
- GitHub Actions workflow at repo root `.github/workflows/frontend.yml` runs lint → typecheck → test → build on every PR touching `frontend/**`.

Module-level detail for the built pieces lives in [`modules/`](modules/).

## 12. How to use these docs

- **Adding a new feature?** Read this file first, then the module file for the feature being touched (if it exists). Add a new `modules/<feature>.md` only when actual code for that feature lands.
- **Editing a module?** Update the corresponding `modules/<name>.md` in the same change-set so docs never drift from code.
- **A module file is missing?** That module hasn't been built yet. Do not extrapolate from the architecture/plan documents — those describe intent, not current state. Implement the module first, then document.
- **The progressive rule:** docs grow only when code grows. An empty stub folder is not a module yet; it gets a doc when it has real behavior.
