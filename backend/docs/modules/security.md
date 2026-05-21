# `common/rate-limit/` + `common/interceptors/request-timeout.interceptor.ts` — Security Hardening (Phase 11)

> Layered Redis-backed rate limits, a 30s per-request time budget, and a strict API-only helmet posture. All of these layers live above the controller — modules added later inherit them automatically.

---

## 1. Shape

```
backend/src/common/
├── rate-limit/
│   ├── rate-limit.types.ts             # RateLimitDescriptor, RateLimitPreset, ratePresetCaps
│   ├── rate-limit.decorator.ts         # @RateLimit({...})
│   ├── rate-limit.service.ts           # Redis sliding-window counter (Lua + SCRIPT LOAD)
│   ├── rate-limit.module.ts            # @Global() — provides service + 2 APP_INTERCEPTOR's
│   ├── global-rate-limit.interceptor.ts
│   ├── route-rate-limit.interceptor.ts
│   ├── rate-limit.service.spec.ts
│   ├── route-rate-limit.interceptor.spec.ts
│   ├── global-rate-limit.interceptor.spec.ts
│   └── index.ts
└── interceptors/
    ├── request-timeout.interceptor.ts
    └── request-timeout.interceptor.spec.ts
```

`RateLimitModule` is `@Global` so the service is reachable anywhere without import noise. It is imported by `AppModule` directly after `MetricsModule` so the two global interceptor providers (`GlobalRateLimitInterceptor` then `RouteRateLimitInterceptor`) register before `HealthModule` and the domain modules. `RequestTimeoutInterceptor` is provided via APP_INTERCEPTOR inside `AppModule` itself.

## 2. The sliding-window counter

`RateLimitService.consume({ key, windowSeconds, max })` is the entire enforcement surface. It runs this Lua script atomically:

1. `zremrangebyscore key -inf (now - windowMs)` — evict entries that fell out of the window.
2. `zcard key` — count what remains.
3. If `count >= max` → return `{ limited=1, count, oldestScore + windowMs }`.
4. Otherwise `zadd key now <token>` (token = `now-<random>` so simultaneous millisecond hits don't share a slot) + `pexpire key windowMs`, then return `{ limited=0, count+1, now + windowMs }`.

The service caches the SHA via `SCRIPT LOAD` and replays with `evalsha`. On `NOSCRIPT` (Redis restarted, eviction) it falls back to `eval` and re-loads on the next call. Any other Redis failure logs a warning and **fails open** — a Redis blip cannot black-hole the API. Observability already surfaces the underlying outage via `/health/ready` + the Postgres pool gauges.

`retryAfterSeconds` derives from the *oldest* entry in the sorted set: that's when the window will slide enough to admit one more call. Returned values are always `Math.ceil`'d to ≥1 so clients never see `Retry-After: 0`.

## 3. The two interceptor layers

Order matters — APP_INTERCEPTOR providers run in registration order:

### `GlobalRateLimitInterceptor`

Runs on every HTTP request. Enforces:
- **IP floor** — `rl:ip:<req.ip>`, `RATE_LIMIT_IP_{WINDOW_SECONDS,MAX}` (default 600/min). Always.
- **Per-user floor** — `rl:user:<req.user.id>`, `RATE_LIMIT_USER_{WINDOW_SECONDS,MAX}` (default 300/min). Only when `JwtAuthGuard` has already populated `req.user`.

On either hit → `Retry-After` header set + `RateLimitedError` thrown. There is no soft mode at this layer by design: these are anti-abuse caps, not UX optimizations.

### `RouteRateLimitInterceptor`

Reads `@RateLimit({ preset, mode, identify, softCache? })` metadata via `Reflector.getAllAndOverride`. Skips when no descriptor is present. For matched routes:

- `caps = ratePresetCaps[descriptor.preset](env)` — the preset string is the *only* knob at the call site; deployment retunes via env vars without an image rebuild.
- `key = rl:<preset>:<identify(req)>`. Returning `null` from `identify` skips this request (used by the auth preset to ignore login attempts without a parseable email — the IP floor still applies).
- Sets `X-RateLimit-Limit` + `X-RateLimit-Remaining` headers on every call.
- **Hard mode** — `Retry-After` + throw `RateLimitedError`.
- **Soft mode** — read `softCache.key(req)` via `CacheService.get(...)` with `softCache.schema`. On hit, apply optional `softCache.wrap(...)` adapter, set `X-RateLimit-Cached: true` + `Retry-After`, and return the cached value via `of(...)`. On miss, fall through to the handler — the soft cap intentionally degrades to a no-op rather than 429'ing a request that has no cached fallback.

### Presets in use today

| Preset | Window | Cap | Identify | Mode | Routes |
| --- | --- | --- | --- | --- | --- |
| `auth` | 15 min | 5 | `req.body.email` (normalized) | hard | `POST /api/auth/login` |
| `send` | 10s | 30 | `req.user.id` | hard | `POST /api/messages/:chatId/send` / `media` / `:stanzaId/forward` |
| `chats` | 5s | 10 | `req.user.id` | **soft** | `GET /api/chats` (serves `CacheService.wrap` payload at `chats:list:<u>:<session>:<limit>:<offset>`) |

The cache key resolver in `ChatsController` mirrors `chatsListCacheKey()` exactly so the soft hit reads the same blob the service writes during the normal 10s wrap.

## 4. The request time budget

`RequestTimeoutInterceptor` pipes every handler observable through rxjs `timeout({ each: REQUEST_TIMEOUT_MS })` (default 30000). On fire it converts the rxjs `TimeoutError` into `RequestTimeoutError` (503 `REQUEST_TIMEOUT`, details `{ timeoutMs }`). Non-HTTP contexts (Socket.IO `@SubscribeMessage`) are skipped — they have their own timing surface.

The interceptor bounds the *client-visible* wait. The Node task continues running in the background until it naturally completes; long-running queue handlers should not lean on this for cancellation. The orchestrator's `terminationGracePeriod` is the canonical kill switch.

## 5. The helmet posture (`main.ts`)

This is an API-only server. The CSP is therefore as tight as it can be:

```
default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
```

Plus:
- `Strict-Transport-Security: max-age=<HSTS_MAX_AGE_SECONDS>; includeSubDomains; preload` (default 2 years).
- `Referrer-Policy: no-referrer`.
- `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-site`, `Cross-Origin-Embedder-Policy: false` (default-helmet COEP would break legitimate cross-origin API consumption).
- `X-Permitted-Cross-Domain-Policies: none`.
- Manual `Permissions-Policy` middleware denying camera, microphone, geolocation, payment, clipboard, USB, MIDI, sensors, fullscreen, autoplay, display-capture.

`x-powered-by` was already disabled in Phase 1.

## 6. Error envelope additions

| Class | Code | Status | When |
| --- | --- | --- | --- |
| `RateLimitedError` | `RATE_LIMITED` | 429 | Either rate-limit interceptor fires in hard mode. `details.retryAfterSeconds` + `details.scope` always present. |
| `RequestTimeoutError` | `REQUEST_TIMEOUT` | 503 | Handler observable exceeded `REQUEST_TIMEOUT_MS`. `details.timeoutMs`. |

The shape is the same `AllExceptionsFilter` envelope as every other error — frontend `AppApiError` decoding works unchanged.

## 7. Env surface (Phase 11)

| Var | Default | Notes |
| --- | --- | --- |
| `RATE_LIMIT_ENABLED` | `true` | Master toggle. Both interceptors short-circuit when false. |
| `REQUEST_TIMEOUT_MS` | `30000` | Per-handler ceiling. |
| `RATE_LIMIT_IP_WINDOW_SECONDS` / `RATE_LIMIT_IP_MAX` | `60` / `600` | Global IP floor. |
| `RATE_LIMIT_USER_WINDOW_SECONDS` / `RATE_LIMIT_USER_MAX` | `60` / `300` | Per-authenticated-user floor. |
| `RATE_LIMIT_AUTH_WINDOW_SECONDS` / `RATE_LIMIT_AUTH_MAX` | `900` / `5` | Login attempts per email. |
| `RATE_LIMIT_SEND_WINDOW_SECONDS` / `RATE_LIMIT_SEND_MAX` | `10` / `30` | Send-message budget per user. |
| `RATE_LIMIT_CHATS_WINDOW_SECONDS` / `RATE_LIMIT_CHATS_MAX` | `5` / `10` | Soft chat-list budget. |
| `HSTS_MAX_AGE_SECONDS` | `63072000` | 2 years. |

All defaults mirror [BACKEND_ARCHITECTURE.md §15](../../../BACKEND_ARCHITECTURE.md).

## 8. CI gate

`.github/workflows/ci.yml` adds two `npm audit --omit=dev` steps:

1. **Hard gate** — `--audit-level=critical` fails the build on any CRITICAL finding.
2. **Advisory** — `--audit-level=high || true` surfaces high/moderate findings without blocking. The current NestJS 10 line ships transitive `multer` HIGHs that only unwind with the NestJS 11 bump tracked separately; once that lands, the hard gate raises to `--audit-level=high`.

## 9. Testing

Unit-only because all primitives are deterministic with an in-memory Redis double + Reflector-driven metadata:

- [`rate-limit.service.spec.ts`](../../src/common/rate-limit/rate-limit.service.spec.ts) — sliding-window counter, window slide refill, per-key isolation, Redis-down fail-open.
- [`route-rate-limit.interceptor.spec.ts`](../../src/common/rate-limit/route-rate-limit.interceptor.spec.ts) — no-descriptor passthrough, hard 429 + `Retry-After`, soft hit serves cached, soft miss degrades, env-disabled noop.
- [`global-rate-limit.interceptor.spec.ts`](../../src/common/rate-limit/global-rate-limit.interceptor.spec.ts) — IP-only when unauthed, IP + user when authed, `Retry-After` on IP block, env-disabled noop.
- [`request-timeout.interceptor.spec.ts`](../../src/common/interceptors/request-timeout.interceptor.spec.ts) — fast passthrough, timeout → 503, handler-error passthrough, non-HTTP skip, error envelope sanity.
- [`test/security.e2e-spec.ts`](../../test/security.e2e-spec.ts) — boots a minimal Nest app with the same helmet + Permissions-Policy + timeout interceptor wiring as `main.ts`; asserts the CSP, HSTS, Permissions-Policy, and `X-Permitted-Cross-Domain-Policies` headers are emitted, and that the slow handler emits the normalized 503 `REQUEST_TIMEOUT` envelope.

Cross-pod shared-counter behaviour falls out of the Redis-backed implementation; a live two-process verification against Testcontainers Redis is bundled with the rest of the live-infra suite in Phase 12.
