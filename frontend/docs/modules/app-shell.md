# Module: App Shell

> The boot orchestration layer. Owns the React tree's root, the providers composition, the top-level error boundary, and the loading gate shown before features are ready.

**Status:** Phase 1 — placeholder shell only. Real providers replace placeholders in their respective phases.

---

## Purpose

The app shell exists to guarantee an ordering contract: every downstream feature mounts only after upstream guarantees (auth, theme, socket, query client) are in place. Without this ordering, features that consume `useAuth()` or `useSocket()` would race against initialization and produce flicker or stale reads.

The shell is also the single place where unhandled errors are caught before they reach the browser console — see [`AppErrorBoundary`](#appferrorboundary).

## Files

| Path | Role |
|---|---|
| `frontend/src/main.tsx` | Entry. Mounts `<StrictMode><App /></StrictMode>` into `#root`. Throws if `#root` is missing. |
| `frontend/src/App.tsx` | Composes `AppErrorBoundary → AppProviders → BootGate`. |
| `frontend/src/app/providers/AppProviders.tsx` | Composes the six root providers in fixed order. Phase 1 ships them as transparent passthrough placeholders. |
| `frontend/src/app/errors/AppErrorBoundary.tsx` | Class component, top-level error boundary. Renders a fallback and dispatches a `window` event for telemetry. |
| `frontend/src/app/ui/BootGate.tsx` | Loading indicator shown until features mount real content. `role="status"`, `aria-live="polite"`. |

The router subdirectory (`frontend/src/app/router/`) exists as empty folders; populated in Phase 4.

## Provider composition contract

`AppProviders` mounts these in order from outermost to innermost. The order is load-bearing:

1. **QueryProvider** — TanStack Query client. Innermost children must be able to call hooks like `useQuery`. (Phase 6 replaces placeholder.)
2. **ThemeProvider** — applies `data-theme` on `<html>` and provides theme context. (Phase 2.)
3. **AuthProvider** — bootstraps a silent refresh on mount, exposes `useAuth()`, emits `auth:ready` / `auth:logged-out` on the event bus. (Phase 3.)
4. **SocketProvider** — waits for `auth:ready`, opens the Socket.IO singleton, exposes connection status. (Phase 5.)
5. **SyncController** — renderless. Registers per-feature socket → cache handlers. (Phase 5.)
6. **ToastProvider** — toast rendering surface. (Phase 2.)

Children of `ToastProvider` render once everything above is ready. In Phase 1 the only child is `BootGate`; from Phase 4 onward `BootGate` is replaced by `<AppRouter>`.

**Do not reorder these providers without updating this contract.** Reordering breaks downstream assumptions (e.g. `SocketProvider` requires `AuthProvider` to have emitted `auth:ready`).

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

In Phase 1 this is the only thing rendered. From Phase 4 onward it's used inside `<Suspense fallback={<BootGate />}>` for lazy route boundaries.

## React tree (current state, Phase 1)

```
#root
└─ <StrictMode>
   └─ <App>
      └─ <AppErrorBoundary>
         └─ <AppProviders>           // 6 placeholder layers (passthrough)
            └─ <BootGate>            // "Loading…" message
```

After all phases land, the inner content becomes `<AppRouter>` with active routes.

## Conventions

- Every component in this module exports a named function (no default exports).
- Return type is always `ReactElement` (with `import type { ReactElement } from 'react'` because `verbatimModuleSyntax` is on).
- No business logic here. The shell strictly orchestrates; features live in `src/features/`.
- The error boundary is the only class component permitted; all other components are function components.

## How to extend / modify

| Need | What to do |
|---|---|
| Add a new global provider | Insert it in `AppProviders.tsx` at the correct depth. Document the ordering rationale in the contract above. |
| Replace a placeholder provider with the real one | Swap the local placeholder function for an import from the implementing feature/module. Update this doc's contract to mark it as live. |
| Customize the loading UI | Edit `BootGate.tsx`. Keep `role="status"` and `aria-live="polite"`. |
| Send error reports to Sentry | Attach the listener inside the observability module (Phase 11). The boundary already emits `app:error`. Do not modify the boundary. |
| Catch async/event-handler errors | Use TanStack Query's `onError` for mutations, and surface via the toast layer. The boundary is not the right tool. |

## Testing

Phase 1 tests covering this module live alongside their source:
- `src/App.test.tsx` — verifies the tree renders and shows the boot gate.
- `src/app/errors/AppErrorBoundary.test.tsx` — verifies fallback render, the `app:error` event, and healthy passthrough.

When replacing a placeholder provider with a real implementation in a later phase, add tests to the implementing feature, not here.

## Dependencies into this module

- `main.tsx` is the entry — Vite's `index.html` points at it.
- `App.tsx` is imported only by `main.tsx`.
- The providers, error boundary, and BootGate are only imported by `App.tsx` in Phase 1; later phases may import `BootGate` from `<Suspense>` fallbacks in `app/router/`.

## References

- Architectural rationale: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §4 (boot sequence) and §4.1 (detailed flow).
- Implementation phase: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 1.
- Master context: [`../context.md`](../context.md).
