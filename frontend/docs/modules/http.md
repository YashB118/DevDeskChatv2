# Module: HTTP Client + Errors + Refresh Queue (`lib/http` + `lib/storage/memory`)

> The single typed gateway through which every HTTP request leaves the frontend. Wraps axios, attaches the in-memory bearer token, performs silent refresh on 401, and translates backend error envelopes into a typed `AppApiError`.

**Status:** Phase 3 — complete and tested against MSW. Sentry breadcrumb integration and `X-Correlation-Id` outbound propagation land in Phase 11.

---

## Purpose

The frontend issues every authenticated request through one axios instance. The instance hides three concerns from feature code:

1. **Token handling.** The access token lives in memory (never in `localStorage` / `sessionStorage`). The interceptor attaches it as `Authorization: Bearer …` so feature code never reads or moves the token.
2. **Silent refresh.** A 401 triggers a single `POST /api/auth/refresh` (cookie-backed) and the original request retries with the new token. Concurrent 401s coalesce behind one in-flight refresh — feature code does not see the dance.
3. **Typed errors.** Anything thrown out of `apiClient.*` is an `AppApiError`. No raw `AxiosError` leaks past the interceptor.

Features call `apiClient.get/post/patch/...` and assert on `AppApiError.code` / `.status` — never on axios internals.

## Files

| Path | Role |
|---|---|
| `frontend/src/lib/http/client.ts` | The axios singleton with request + response interceptors. |
| `frontend/src/lib/http/errors.ts` | `AppApiError` class and `ErrorEnvelopeSchema` (Zod). |
| `frontend/src/lib/http/retry.ts` | Refresh-handler registration + the in-flight coalescing primitive. |
| `frontend/src/lib/storage/memory.ts` | Closure-backed access-token slot (`get/set/clearAccessToken`). |
| `frontend/src/lib/http/client.test.ts` | MSW integration tests — token attach, silent refresh, coalescing, error mapping. |
| `frontend/src/lib/http/errors.test.ts` | Envelope-mapping coverage. |
| `frontend/src/lib/http/retry.test.ts` | Refresh-queue concurrency + recovery-after-rejection. |
| `frontend/src/lib/storage/memory.test.ts` | Round-trip + `localStorage` non-leak. |

## `apiClient` (`client.ts`)

A single axios instance:

```ts
axios.create({
  baseURL: env.VITE_API_BASE_URL,
  withCredentials: true,        // refresh cookie must travel
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});
```

**Request interceptor** — reads `getAccessToken()`; if present, sets `Authorization: Bearer <token>`. Otherwise no header is added (so unauthenticated endpoints work transparently).

**Response interceptor** —
- On success, returns the response unchanged.
- On non-`AxiosError`, rethrows untouched.
- On 401, if the config is not already marked `_retried` and not explicitly tagged `_skipAuthRefresh`, marks `_retried` and calls `refreshAccessToken()`. On refresh success, replays the original request with the now-current `Authorization` header (the request interceptor re-runs). On refresh failure, throws `AppApiError.fromAxios(originalError)` — the caller sees the original 401, not the refresh error.
- On every other error (including 401 with `_retried` / `_skipAuthRefresh` already set), throws `AppApiError.fromAxios(error)`.

### `_skipAuthRefresh` tag

`auth.api.ts` passes `{ _skipAuthRefresh: true }` on the auth endpoints themselves (`login`, `refresh`, `logout`). This is critical: if a refresh attempt itself returned 401, we must NOT try to refresh again — the user is unauthenticated. The tag is a private contract between `auth.api.ts` and the response interceptor; feature code outside `features/auth/` should not set it.

The tag is passed via the axios config and is typed via the `AppRequestConfig` extension exported from `client.ts`.

## `AppApiError` (`errors.ts`)

```ts
class AppApiError extends Error {
  code: string;
  status: number;
  correlationId: string | undefined;
  details: unknown;
}
```

`AppApiError.fromAxios(err)` decision tree:

1. **No response on the AxiosError** → `{ code: 'NETWORK_ERROR', status: 0, message: err.message }`.
2. **Response data matches `ErrorEnvelopeSchema`** → uses `error.code` / `error.message` / `error.correlationId` / `error.details` directly. If the envelope lacks `correlationId`, falls back to the `x-correlation-id` response header.
3. **Response present but envelope mismatched** → `{ code: 'UNKNOWN_ERROR', status, message: err.message, correlationId: header? }`.

`AppApiError.isAppApiError(err)` is the type guard used by form code and tests.

### Why envelope-strict?

The backend's invariant is that every error response carries `{ error: { code, message, correlationId, details? } }` (see [`backend/docs/context.md`](../../../backend/docs/context.md) §12a). The frontend treats `code` as the only stable cross-cut identifier — `message` is human-readable and may change; `details` is opaque per-endpoint. Field-level mapping (e.g. `LoginForm`'s `INVALID_CREDENTIALS → password field error`) is keyed on `code`.

## Refresh queue (`retry.ts`)

```ts
registerRefreshHandler(fn: () => Promise<string>): void
clearRefreshHandler(): void
refreshAccessToken(): Promise<string>
isRefreshing(): boolean
_resetRefreshState(): void   // tests only
```

Semantics:
- Exactly one handler may be registered at a time. The auth provider sets it on mount and clears it on unmount.
- `refreshAccessToken()` returns the in-flight `Promise<string>` if one exists; otherwise it invokes the handler and stores the result. The slot clears in `finally`, so a settled promise (resolved OR rejected) frees the slot for the next attempt.
- `refreshAccessToken()` rejects synchronously if no handler is registered.

This is a tiny module — fewer than 30 lines — and it carries the entire "queue concurrent 401s behind one refresh" guarantee.

## In-memory token (`memory.ts`)

```ts
let accessToken: string | null = null;
getAccessToken / setAccessToken / clearAccessToken
```

Lives in a module-level closure. No persistence. No React. Always cleared by logout and by the auth provider on refresh failure.

The `memory.test.ts` includes a guardrail assertion: setting the token MUST NOT cause anything to appear in `localStorage`. If a future contributor adds a write-through, that test fails immediately.

## Integration points

| Caller | How it uses the module |
|---|---|
| `features/auth/api/auth.api.ts` | Calls `apiClient.post/get/patch` with `_skipAuthRefresh` on the auth endpoints; Zod-parses every response. |
| `features/auth/components/AuthProvider.tsx` | On mount, calls `registerRefreshHandler(...)` with a closure that runs `authApi.refresh()`, writes the new token via `setAccessToken`, emits `auth:logged-out` on failure. On unmount, calls `clearRefreshHandler()`. |
| `features/auth/hooks/useAuth.ts` | Calls `clearAccessToken()` on logout. |
| Phase 6+ feature API modules | Will follow the same pattern — `apiClient.get(...)` + Zod parse + throw `AppApiError`. |

## Testing

| File | Coverage |
|---|---|
| `client.test.ts` | MSW-backed. Token attach; 401 → refresh → retry round-trip; coalesce of two parallel 401s behind one refresh; non-401 → `AppApiError` instance with the correct `code` and `status`; refresh failure → original 401 surfaces. |
| `errors.test.ts` | Envelope-strict parse with all four fields; missing envelope falls back to `UNKNOWN_ERROR`; missing response → `NETWORK_ERROR`; envelope without `correlationId` reads the header. |
| `retry.test.ts` | Three concurrent callers see one handler invocation; sequential calls see a fresh refresh each time; rejected refresh clears the slot so the next call retries; no-handler rejects. |
| `memory.test.ts` | Get returns null before set; round-trip; clear resets; `localStorage` stays empty. |

`client.test.ts` is the canonical example for MSW lifecycle in this codebase — copy its `beforeAll/afterEach/afterAll` shape when adding new MSW-backed tests.

## Security baseline (Phase 3)

- Token never persisted. Memory only.
- `withCredentials: true` ensures the httpOnly refresh cookie travels; the cookie itself is set by the backend and is invisible to JS.
- The refresh endpoint sets `_skipAuthRefresh: true` — a refresh failure cannot loop on itself.
- 401 with `_retried: true` is not re-refreshed; this prevents infinite-loop chains if the refresh handler hands back a still-invalid token.
- The Bearer header is the only token surface; no token ever appears in query strings, URL fragments, or response bodies that the frontend logs.

## How to extend / modify

| Need | What to do |
|---|---|
| Add a new endpoint | Build the feature's `*.api.ts` calling `apiClient.<method>(path, body)` + Zod parse. Do not create a second axios instance. |
| Add an outbound `X-Correlation-Id` header | Phase 11. Touch the request interceptor in `client.ts` and add a Sentry breadcrumb on every response. |
| Change the error envelope shape | Coordinate with the backend first. Update `ErrorEnvelopeSchema` in `errors.ts` and add test cases in `errors.test.ts`. |
| Add a new error code mapping | The mapping lives in the feature (e.g. `LoginForm`'s `errorCodeMap`). Do not add it to `errors.ts`. |
| Add a retry strategy for transient 5xx | Wrap the caller with axios-retry or a feature-level retry hook; do not add it to the global interceptor (Phase 1 architecture: `mutations.retry: 0`, `queries.retry: 1` happens at TanStack Query level). |
| Switch token storage | Don't. Memory-only is a security baseline; changing it requires architecture sign-off. |

## Known deviations / TODOs

- `X-Correlation-Id` outbound header is not yet set — backend echoes one and we read it on errors, but feature code does not yet propagate a per-request ID. Lands in Phase 11 alongside Sentry.
- The 15 s timeout is global. Specific long-running endpoints (media uploads in Phase 8) will override per-request.
- The `_skipAuthRefresh` flag is typed via a cast (`as never`) inside `auth.api.ts` because axios's `AxiosRequestConfig` doesn't permit unknown keys without ceremony. Acceptable trade-off; the alternative (a custom request wrapper) would obscure the call site.

## References

- Architecture: [`FRONTEND_ARCHITECTURE.md`](../../../FRONTEND_ARCHITECTURE.md) §9 (API layer), §15 (engineering standards).
- Implementation plan: [`FRONTEND_IMPLEMENTATION_PLAN.md`](../../../FRONTEND_IMPLEMENTATION_PLAN.md) Phase 3.
- Backend invariants: [`backend/docs/context.md`](../../../backend/docs/context.md) §12a (Frontend integration contract).
- Auth feature consumer: [`auth.md`](auth.md).
- Master context: [`../context.md`](../context.md).
