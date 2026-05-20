# Module: App Shell

> The boot orchestration layer. Owns the React tree's root, the providers composition, the top-level error boundary, the loading gate, and the dev-only styleguide screen.

**Status:** Phase 3 — `ThemeProvider`, `ToastProvider`, and now `AuthProvider` are real. The remaining three root providers stay transparent passthroughs until their respective phases. A dev-only `/__styleguide` path renders the design-system surface. Full routing arrives in Phase 4.

---

## Purpose

The app shell exists to guarantee an ordering contract: every downstream feature mounts only after upstream guarantees (auth, theme, socket, query client) are in place. Without this ordering, features that consume `useAuth()` or `useSocket()` would race against initialization and produce flicker or stale reads.

The shell is also the single place where unhandled errors are caught before they reach the browser console — see [`AppErrorBoundary`](#apperrorboundary).

## Files

| Path | Role |
|---|---|
| `frontend/src/main.tsx` | Entry. Mounts `<StrictMode><App /></StrictMode>` into `#root`. Throws if `#root` is missing. Imports `@/styles/globals.css` so Tailwind + tokens + reset apply before first paint. |
| `frontend/src/App.tsx` | Composes `AppErrorBoundary → AppProviders → (BootGate ∣ Styleguide)`. The styleguide branch only renders when `import.meta.env.DEV` AND `window.location.pathname === '/__styleguide'`. |
| `frontend/src/app/providers/AppProviders.tsx` | Composes the six root providers in fixed order. `ThemeProvider` + `ToastProvider` from `@/design-system`; `AuthProvider` from `@/features/auth` (Phase 3); `QueryProvider`, `SocketProvider`, `SyncController` remain local passthrough placeholders awaiting their phases. |
| `frontend/src/app/errors/AppErrorBoundary.tsx` | Class component, top-level error boundary. Renders a fallback and dispatches a `window` event for telemetry. |
| `frontend/src/app/ui/BootGate.tsx` | Loading indicator shown until features mount real content. `role="status"`, `aria-live="polite"`. |
| `frontend/src/app/ui/Styleguide.tsx` | Dev-only visual smoke screen: renders every primitive + compound, plus a theme toggle that calls `setPreference()`. Replaced by `<AppRouter>` in Phase 4 (the page becomes a real route). |

The router subdirectory (`frontend/src/app/router/`) exists as empty folders; populated in Phase 4.

## Provider composition contract

`AppProviders` mounts these in order from outermost to innermost. The order is load-bearing:

1. **QueryProvider** — TanStack Query client. Innermost children must be able to call hooks like `useQuery`. ⏳ Phase 6 replaces placeholder.
2. **ThemeProvider** — applies `data-theme` on `<html>` and provides theme context via `useTheme()`. ✅ Phase 2.
3. **AuthProvider** — registers the HTTP layer's refresh handler with `lib/http/retry`, runs a silent refresh on mount (`POST /api/auth/refresh` → `GET /api/auth/me`), emits `auth:ready` on success and `auth:logged-out` on refresh failure. Public hook surface is `useAuth()` from `@/features/auth`. ✅ Phase 3.
4. **SocketProvider** — waits for `auth:ready`, opens the Socket.IO singleton, exposes connection status. ⏳ Phase 5.
5. **SyncController** — renderless. Registers per-feature socket → cache handlers. ⏳ Phase 5.
6. **ToastProvider** — Radix Toast viewport + `useToast()` context. ✅ Phase 2.

Children of `ToastProvider` render once everything above is ready. After Phase 3 the child is still either `<BootGate>` (default) or `<Styleguide>` (when the URL is `/__styleguide` in dev). From Phase 4 onward this child becomes `<AppRouter>`.

**Do not reorder these providers without updating this contract.** Reordering breaks downstream assumptions:
- `AuthProvider` must come before `SocketProvider` because the socket waits for `auth:ready`.
- `AuthProvider` must come after `QueryProvider` (Phase 6) once mutations move into TanStack Query — `useAuth().login` will become a mutation and needs the query client.
- `ToastProvider` reads `ThemeProvider`'s tokens via CSS variables.

## ThemeProvider integration

`AppProviders` imports `ThemeProvider` from `@/design-system/theme`. The provider reads the initial preference from the `data-theme-preference` attribute that the `public/theme-bootstrap.js` script sets in `<head>` before React mounts — this is what keeps initial paint flicker-free.

Inside the tree, components consume `useTheme()` (see [`design-system.md`](design-system.md) for the full hook surface).

## ToastProvider integration

`AppProviders` imports `ToastProvider` from `@/design-system/primitives/Toast`. The provider:
- Wraps Radix's `<Toast.Provider>` and renders a fixed `<Toast.Viewport>` in the bottom-right.
- Exposes `useToast()` returning `{ push, dismiss }`.
- Holds a small in-memory queue; toasts auto-dismiss after `durationMs` (default 4500 ms).

Features call `push({ title, description, tone })` for transient feedback; never mount their own toast viewports.

## AppErrorBoundary

A class component (because React error boundaries must be classes) that catches errors thrown during render anywhere in its subtree.

Behavior:
- Stores the caught `Error` in state.
- Renders either the provided `fallback` prop or a default fallback with the error message and a "Reload UI" button that calls `reset()` to clear state.
- On catch, dispatches `new CustomEvent('app:error', { detail: { error, componentStack } })` on `window`. This is the telemetry hook — Phase 11 attaches a Sentry listener.
- The `reset()` method clears state to re-attempt render; useful if the user retries an action after a transient failure.

This boundary catches render-phase errors only. It does **not** catch:
- Errors in event handlers (use try/catch in the handler).
- Async errors (use mutation error handling via TanStack Query).
- Errors during server-side rendering (the app is client-rendered only).

## BootGate

Minimal loading indicator. Centers a "Loading…" message vertically and horizontally. Uses `role="status"` so assistive tech announces the loading state.

In Phase 2 this is the default render path. From Phase 4 onward it's used inside `<Suspense fallback={<BootGate />}>` for lazy route boundaries.

## Styleguide (`/__styleguide`)

A dev-only visual sandbox that imports every primitive and compound from `@/design-system`, plus a theme-preference switcher. It lets contributors do a quick visual smoke without running Storybook.

Gating:
- `import.meta.env.DEV` must be true (Vite production builds strip this branch).
- `window.location.pathname` must equal `/__styleguide`.

It uses a path string check, not React Router, because the router lands in Phase 4. When the router arrives, the styleguide will move into the route table behind the same dev guard.

## React tree (current state, Phase 3)

```
<head>
  <script src="/theme-bootstrap.js" />   // sets data-theme + data-theme-preference synchronously
#root
└─ <StrictMode>
   └─ <App>
      └─ <AppErrorBoundary>
         └─ <AppProviders>
            ├─ <QueryProvider>           // placeholder
            ├─ <ThemeProvider>           // ✅ Phase 2
            │   ├─ <AuthProvider>        // ✅ Phase 3 (from @/features/auth)
            │   │   ├─ <SocketProvider>  // placeholder
            │   │   │   ├─ <SyncController>  // placeholder
            │   │   │   │   └─ <ToastProvider>  // ✅ Phase 2 (Radix Toast viewport)
            │   │   │   │       └─ <BootGate>  |  <Styleguide>  // dev path branch
```

After all phases land, the inner content becomes `<AppRouter>` with active routes.

## Conventions

- Every component in this module exports a named function (no default exports).
- Return type is always `ReactElement` (with `import type { ReactElement } from 'react'` because `verbatimModuleSyntax` is on).
- No business logic here. The shell strictly orchestrates; features live in `src/features/`.
- The error boundary is the only class component permitted; all other components are function components.
- The styleguide is dev-only — never gate production behavior on the same path check.

## How to extend / modify

| Need | What to do |
|---|---|
| Add a new global provider | Insert it in `AppProviders.tsx` at the correct depth. Document the ordering rationale in the contract above. |
| Replace a placeholder provider with the real one | Swap the local placeholder function for an import from the implementing feature/module. Update this doc's contract to mark it as live. |
| Customize the loading UI | Edit `BootGate.tsx`. Keep `role="status"` and `aria-live="polite"`. |
| Send error reports to Sentry | Attach the listener inside the observability module (Phase 11). The boundary already emits `app:error`. Do not modify the boundary. |
| Catch async/event-handler errors | Use TanStack Query's `onError` for mutations, and surface via the toast layer. The boundary is not the right tool. |
| Add a new entry to the styleguide | Import from `@/design-system` inside `Styleguide.tsx`. Wrap in a `<Block title="…">`. Never import feature-level code here. |
| Move the styleguide behind a real route | Phase 4 — register it under `app/router/routes.ts` with a dev-only guard, then delete the path-check branch in `App.tsx`. |

## Testing

Phase 2 tests covering this module live alongside their source:
- `src/App.test.tsx` — verifies the tree renders and shows the boot gate.
- `src/app/errors/AppErrorBoundary.test.tsx` — verifies fallback render, the `app:error` event, and healthy passthrough.

Theme and toast tests live in the design-system module ([`design-system.md`](design-system.md)), not here, because the implementations live there.

When replacing a placeholder provider with a real implementation in a later phase, add tests to the implementing feature, not here.

## Dependencies into this module

- `main.tsx` is the entry — Vite's `index.html` points at it. `index.html` also loads `/theme-bootstrap.js` before the module script.
- `App.tsx` is imported only by `main.tsx`.
- `AppProviders` imports `ThemeProvider` and `ToastProvider` from `@/design-system`, and `AuthProvider` from `@/features/auth` (Phase 3). The remaining provider placeholders, error boundary, BootGate, and Styleguide are only imported by `App.tsx`. Later phases may import `BootGate` from `<Suspense>` fallbacks in `app/router/`.

## References

- Architectural rationale: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §4 (boot sequence), §4.1 (detailed flow), §7.2 (theme switching).
- Implementation phases: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phases 1–3.
- Design system surface: [`design-system.md`](design-system.md).
- Auth feature surface: [`auth.md`](auth.md).
- HTTP layer surface: [`http.md`](http.md).
- Master context: [`../context.md`](../context.md).
