# Module: Auth Feature (`features/auth`)

> Owns the authentication surface: silent refresh on mount, login / logout / password change, and the `useAuth()` hook that the rest of the app reads. Sits on top of the HTTP layer ([`http.md`](http.md)) and emits to the realtime event bus ([`realtime-event-bus.md`](realtime-event-bus.md)).

**Status:** Phase 3 — complete. Login → dashboard redirect lands with the router in Phase 4. `useAuth().login` migrates to a TanStack Query mutation in Phase 6.

---

## Purpose

Every other authenticated feature in the app — chats, messages, sessions, admin panels — depends on three guarantees this feature provides:

1. **A bootstrapped session.** On app boot, the auth provider runs a silent refresh; by the time `auth:ready` fires on the bus, the access token is in memory and `useAuth().user` is populated.
2. **A working refresh handler.** The HTTP layer's `lib/http/retry` slot is registered by the auth provider. Without it, the very first 401 anywhere in the app would log the user out.
3. **A single source of truth for who the user is.** `useAuth()` is the only place feature code reads the current user, role, and auth status. Component props and store slices never duplicate it.

The feature also owns the public-facing login + password-change UI; these forms encode the field-level error mapping that translates backend `code` values into user-visible messages.

## Files

```
frontend/src/features/auth/
├── api/
│   └── auth.api.ts                 # login / refresh / logout / me / changePassword
├── components/
│   ├── AuthProvider.tsx            # registers refresh handler, runs silent refresh
│   ├── LoginForm.tsx               # RHF + zodResolver, field-level error mapping
│   ├── LoginForm.test.tsx
│   ├── PasswordChangeForm.tsx
│   └── LogoutButton.tsx
├── hooks/
│   ├── useAuth.ts                  # public hook
│   └── useBootstrapAuth.ts         # silent-refresh effect, runs once
├── store/
│   └── auth.store.ts               # useSyncExternalStore-backed singleton
├── types.ts                        # Zod schemas + inferred types
└── index.ts                        # public API (the only allowed entry from outside)
```

`index.ts` exports: `useAuth`, `AuthProvider`, `LoginForm`, `PasswordChangeForm`, `LogoutButton`, and the public types (`User`, `UserRole`, `LoginInput`, `PasswordChangeInput`, `LoginResponse`, `RefreshResponse`). Cross-feature code must import through this file — `eslint-plugin-boundaries` enforces it.

## Backend contract

Wired to the canonical contract — see [`context.md`](../context.md) §9 and `backend/docs/context.md` §12a.

| Endpoint | Method | Body | Response | Notes |
|---|---|---|---|---|
| `/api/auth/login` | POST | `{ email, password }` | `{ accessToken, user }` | `_skipAuthRefresh` |
| `/api/auth/refresh` | POST | — (cookie-bound) | `{ accessToken }` | `_skipAuthRefresh` |
| `/api/auth/logout` | POST | — | 204 | `_skipAuthRefresh`; failure swallowed locally |
| `/api/auth/me` | GET | — | `User` | Used during bootstrap and any later refetch |
| `/api/auth/password` | PATCH | `{ currentPassword, newPassword }` | 204 | |

Every response is Zod-parsed at the boundary. Schema definitions live in `types.ts`; the inferred types flow out through `index.ts`.

## Auth state machine

The auth state is a tiny three-status state machine driven through `useSyncExternalStore`:

```
                              ┌───────────────────┐
                              │   initializing    │   (initial value on app mount)
                              └────────┬──────────┘
                                       │
                       silent refresh OK│   silent refresh fails / no session
                                       ▼   ▼
            ┌───────────────────┐         ┌───────────────────┐
            │   authenticated   │ ◀─────▶ │  unauthenticated  │
            └────────┬──────────┘  login   └────────┬──────────┘
                     │             logout            │
                     │             refresh-failed    │
                     └───────────────────────────────┘
```

State transitions:

| From | To | Trigger |
|---|---|---|
| `initializing` | `authenticated` | Bootstrap refresh succeeded; `me` returned the user |
| `initializing` | `unauthenticated` | Bootstrap refresh threw (no session / 401 / network) |
| `unauthenticated` | `authenticated` | `useAuth().login()` succeeded |
| `authenticated` | `unauthenticated` | `useAuth().logout()` called, OR HTTP layer's refresh handler failed |

Each transition writes to the in-memory token slot accordingly: `authenticated` ⇒ token set; `unauthenticated` ⇒ token cleared. The store and the token never diverge.

The store does NOT use Zustand. Phase 6 introduces Zustand for feature-scoped UI state; the auth status is global and small enough that `useSyncExternalStore` over a module-level value is the simplest correct primitive. Migrating to Zustand later is mechanical if needed.

## `AuthProvider` lifecycle

`AuthProvider` is the React surface this feature contributes to `AppProviders`. On mount it:

1. **Registers the refresh handler** with `lib/http/retry.registerRefreshHandler`. The handler runs `authApi.refresh()`, writes the new token via `setAccessToken`, and returns the token to the queued requests. On failure, it clears the token, resets the auth state to `unauthenticated`, emits `auth:logged-out` with `reason: 'refresh-failed'`, and rethrows so callers see the original error.
2. **Runs the silent-refresh bootstrap** via `useBootstrapAuth`. This calls `authApi.refresh()` then `authApi.me()` (in series — `refresh` must populate the token first). On success it sets the store to `authenticated` and emits `auth:ready` with the branded `userId`. On any failure it resets to `unauthenticated`. The effect is gated by a ref so it never re-runs even under StrictMode's double-invocation.
3. **On unmount**, clears the refresh handler so a stale closure cannot fire after the provider is gone.

The provider returns its `children` unchanged — it is renderless. UI feedback about auth state lives downstream (`useAuth().status`).

## `useAuth()` API

```ts
interface UseAuthReturn {
  status: 'initializing' | 'authenticated' | 'unauthenticated';
  user: User | null;
  error: string | null;
  isAuthenticated: boolean;          // sugar for `status === 'authenticated' && user !== null`
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (input: PasswordChangeInput) => Promise<void>;
}
```

Semantics:
- `login` writes the token + user on success, sets status to `authenticated`, emits `auth:ready` with `toUserId(user.id)`. On failure it sets `error` and rethrows; the calling form decides whether to surface the error message or map a `code` to a field-level error.
- `logout` calls `authApi.logout()` and **swallows the error** — the local cleanup is the priority, and a logout that fails server-side still terminates the local session. Always clears the token, resets the store, and emits `auth:logged-out` with `reason: 'manual'`.
- `changePassword` is a pure proxy to `authApi.changePassword`; success leaves the session intact (backend does not rotate tokens on password change).
- All three are stable (`useCallback`), safe to pass as props.

`useAuth()` does NOT trigger the silent refresh — only `<AuthProvider>` does. Reading `useAuth()` before the provider has finished bootstrap returns `status: 'initializing'` and a null user.

## Forms

### `LoginForm`

- React Hook Form + `zodResolver(LoginInputSchema)`; mode: `onSubmit`.
- Validation: email format + 8-character minimum password.
- On submit: calls `useAuth().login(values)`. On `AppApiError`, runs the `errorCodeMap`:
  - `INVALID_CREDENTIALS` → field-level error on `password` ("Email or password is incorrect.").
  - `USER_DISABLED` → form-level error ("This account has been disabled.").
  - `RATE_LIMITED` → form-level error ("Too many attempts. Try again in a moment.").
  - Anything else → form-level error using `err.message`.
- Submit button is disabled and shows a spinner while `isSubmitting`.
- Inline error text uses `role="alert"` and `aria-describedby`; the input pairs with `aria-invalid` when invalid.

Calling code wires the redirect via the optional `onSuccess` prop. Phase 4's router-aware login screen uses this to `navigate(routes.dashboard)` after login.

### `PasswordChangeForm`

- RHF + `zodResolver(PasswordChangeInputSchema)`.
- Validation: current password required; new password ≥ 8 chars; `confirmPassword` must match (Zod `.refine` rule).
- On submit success: shows an inline `role="status"` confirmation and resets the form. On failure: form-level error with `err.message`.

### `LogoutButton`

A `<Button variant="ghost">` that runs `useAuth().logout()`. Disables itself while pending. All other Button props pass through (size, className, etc.) so it composes inside menus and headers.

## Why no `useAuthMutation` yet?

Phase 6 brings TanStack Query, at which point `login` / `logout` / `changePassword` should be `useMutation` calls with `onMutate` / `onError` rollback semantics for consistency with the rest of the codebase. We did NOT pre-build mutation wrappers in Phase 3 because:

- TanStack Query is not yet in the provider tree; pulling it in early would either short-circuit the phase plan or require a placeholder client.
- The current shape (plain async functions on `useAuth()`) is enough to ship the login screen and the silent refresh.

The migration in Phase 6 should be mechanical: replace the bodies of `login` / `logout` / `changePassword` with mutation hooks, keep the public shape identical.

## Cross-module wiring

| Outbound | Reason |
|---|---|
| `@/lib/http/client` | Calls every endpoint. |
| `@/lib/http/retry` | `registerRefreshHandler` / `clearRefreshHandler` in `AuthProvider`. |
| `@/lib/http/errors` | `AppApiError.isAppApiError` for form-level error mapping. |
| `@/lib/storage/memory` | `setAccessToken` / `clearAccessToken` on every state transition. |
| `@/realtime/eventBus` | Emits `auth:ready` / `auth:logged-out`. |
| `@/shared/types/ids` | `toUserId(user.id)` so the `auth:ready` payload carries a branded ID. |
| `@/design-system/primitives/{Button,Input}` | Forms + `LogoutButton`. |

| Inbound | Reason |
|---|---|
| `@/app/providers/AppProviders` | Imports `AuthProvider` from `@/features/auth` and mounts it. |
| Phase 4 router | `LoginForm`, `LogoutButton`, `useAuth().isAuthenticated` for guards. |
| Phase 5 socket provider | Subscribes to `auth:ready` / `auth:logged-out` to open / close the socket. |
| Phase 9 admin guard | Reads `useAuth().user.role === 'admin'`. |

## Tests

| File | What it covers |
|---|---|
| `features/auth/components/LoginForm.test.tsx` | Empty-submit validation surfaces both field errors; happy path stores the token (MSW handler returns the canonical envelope) and invokes `onSuccess`; `INVALID_CREDENTIALS` 401 surfaces a field-level error and leaves the token unset. |
| (via HTTP module) `lib/http/client.test.ts` | Silent refresh round-trip, coalescing of parallel 401s, refresh-failure surfacing. |
| (via HTTP module) `lib/http/retry.test.ts` | Refresh-queue concurrency. |

We did not add a dedicated test for `useAuth().login()` in isolation because `LoginForm` exercises the hook end-to-end against MSW. When Phase 6 migrates `login` into a mutation, add a hook-level test (`renderHook` + MSW) so the contract is locked.

`useBootstrapAuth` is implicitly covered because `AuthProvider` mounts inside `AppProviders` in the rendering smoke test (`App.test.tsx`). The current jsdom run prints a noisy `ECONNREFUSED` from the silent-refresh attempt because that test does not start MSW; the attempt fails cleanly (`resetAuthState`) and the test still passes. Suppressing the log lands in Phase 4 alongside the router test setup.

## How to extend / modify

| Need | What to do |
|---|---|
| Add a new auth endpoint | Add the Zod schema + the inferred type in `types.ts`; add a function in `auth.api.ts`; surface the operation through `useAuth()`. |
| Add a new error-code → UI mapping | Edit the relevant form's `errorCodeMap`. Do not pollute `lib/http/errors.ts` with UI strings. |
| Add a "remember me" toggle | The frontend already keeps the access token in memory only; "remember me" is a backend concern about refresh-cookie TTL. Coordinate. |
| Migrate to TanStack Query mutations | Phase 6. Keep `useAuth()` exports identical. |
| Add MFA flow | Add a new `authApi.verifyMfa` + a `MfaForm` component; gate the auth state transition from `initializing → authenticated` on the MFA step. |
| Display "Reauthenticate to continue" | Listen to `auth:logged-out` with `reason: 'refresh-failed'` on the event bus and surface a toast or modal from a higher-level layout. |

## Known deviations / TODOs

- No router yet; `LoginForm.onSuccess` is the only post-login hook. Phase 4 wires `navigate(routes.dashboard)`.
- `useAuth().login` is a plain async function, not a TanStack Query mutation. Phase 6 migrates.
- The auth store is a module-local `useSyncExternalStore` instead of a Zustand slice. Migration is optional; the current implementation has no consumers outside the feature.
- No test against a `useBootstrapAuth` rerender under StrictMode beyond the implicit `App.test.tsx` smoke. The `started` ref guard is the protection mechanism; consider adding a focused test in Phase 4.

## References

- Architecture: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §4 (boot sequence), §9 (HTTP & data), §10 (type safety).
- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 3.
- HTTP layer: [`http.md`](http.md).
- Event bus: [`realtime-event-bus.md`](realtime-event-bus.md).
- App-shell integration: [`app-shell.md`](app-shell.md).
- Master context: [`../context.md`](../context.md).
