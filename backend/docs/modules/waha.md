## Module — WAHA

> Resilience-wrapped facade for the WAHA HTTP API. `WahaClient` is a pure typed axios wrapper; `WahaService` adds per-method circuit breaking, exponential retry on idempotent GETs, TTL caches for hot read paths, and converts every upstream error into `ExternalServiceError`. Only modules that import `WahaModule` may talk to WAHA — never use axios or fetch directly elsewhere.

**Files**
- `src/integrations/waha/waha.module.ts` — provides `WahaClient` + `WahaService`, exports `WahaService`.
- `src/integrations/waha/waha.client.ts` — typed axios instance, headers (`X-Api-Key` when configured), per-call timeouts. Translates `AxiosError` → `ExternalServiceError` with `WAHA_5XX` / `WAHA_HTTP_ERROR` / `WAHA_UNKNOWN` codes plus `{ method, url, status?, axiosCode? }` details.
- `src/integrations/waha/waha.service.ts` — per-method `CircuitBreaker`, `TtlCache` for sessions/single-session/status/chats, retry policy.
- `src/integrations/waha/circuit-breaker.ts` — closed → open → half-open → closed state machine; opens after `WAHA_CB_FAILURE_THRESHOLD` consecutive failures, cools down for `WAHA_CB_COOLDOWN_MS`, recovers on a successful probe.
- `src/integrations/waha/ttl-cache.ts` — in-process TTL map with single-flight (`wrap(key, loader)` deduplicates concurrent loaders so the upstream gets one in-flight call).
- `src/integrations/waha/waha.types.ts` — Zod schemas + interfaces for the upstream shapes the app consumes (`WahaSession`, `WahaChat`, `WahaMessage`, `SendTextParams`, `SendMediaParams`, ...).

---

## 1. Responsibility

- Centralize every outbound call to WAHA.
- Hide upstream flakiness behind a circuit breaker so a degraded endpoint doesn't drag the whole integration down.
- Cache idempotent reads: `listSessions` / `getSession` / `getSessionStatus` (5s), `listChats` (10s).
- Retry idempotent calls only (5xx + network errors); mutations never retry — duplicate side-effects are worse than a 502.
- Expose `invalidateSession(name)` and `invalidateChats(session?)` so the webhook layer can clear caches when WAHA pushes a state change.

## 2. Retry policy

```
attempts ≤ WAHA_RETRY_MAX
delay    = WAHA_RETRY_BASE_MS * 2^(attempt-1)
retries  iff err is ExternalServiceError AND
         (status ≥ 500 OR axiosCode is set)
```

Mutations (`sendText`, `sendMedia`, `editMessage`, `deleteMessage`, `reactToMessage`, `forwardMessage`, `start/stop/deleteSession`) skip retry entirely.

## 3. Circuit breaker

One per method (lazy-created). On open the call short-circuits with `ExternalServiceError(code: 'WAHA_UNAVAILABLE')` until cooldown elapses. After cooldown the next call enters half-open; success closes the circuit, failure re-opens immediately. State is observable via `WahaService.circuitStatus(method)` (Phase 10 wires it to a Prom gauge).

## 4. Tests (`src/integrations/waha/*.spec.ts`)

- TtlCache: TTL expiry, single-flight under concurrent wrap calls.
- CircuitBreaker: state machine across closed/open/half-open paths; consecutive-failure reset on success.
- WahaClient: local HTTP stub verifies header pass-through, JSON body for sends, 5xx → `WAHA_5XX`, 4xx → `WAHA_HTTP_ERROR`.
- WahaService: caches across calls + invalidates on demand, retries 5xx exactly until success, never retries mutations, opens the circuit and short-circuits subsequent calls.
