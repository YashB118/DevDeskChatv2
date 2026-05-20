# Backend — Application Context

> Root context for the DevChatDesk backend. Read this first. Every module gets a separate file under [modules/](modules/) that drills into its own surface. This document is grown progressively — only areas that exist in code today are described here; future phases append their own modules.

---

## 1. Purpose

DevChatDesk's backend is the single server that fronts a multi-tenant team WhatsApp inbox. It owns:

- Authentication, authorization, audit (✅ Phase 3).
- Real-time fan-out to operator clients (✅ Phase 4).
- Background processing of WAHA webhooks (✅ Phase 7).
- Resilience-wrapped WAHA HTTP client + read-only NOWEB SQLite reader (✅ Phase 6).
- Conversation, message, and session state (✅ Phase 8).
- Collaboration: assignments, mute, feedback (planned, Phase 9).

Completed phases of `BACKEND_IMPLEMENTATION_PLAN.md` today: **Phase 1 — Foundation**, **Phase 2 — Persistence Layer**, **Phase 3 — Authentication**, **Phase 4 — Real-time Core**, **Phase 5 — Queue Infrastructure**, **Phase 6 — External Integration: WAHA + SQLite Store**, **Phase 7 — Webhook Ingestion**, **Phase 8 — Domain Modules**. The server boots, parses env, connects to PostgreSQL via TypeORM and Redis via ioredis, exposes terminus-driven liveness + readiness probes, signs RS256 JWTs, rotates opaque refresh tokens with family-scoped reuse detection, writes append-only audit entries, accepts authenticated Socket.IO connections with Redis-adapter fan-out and a typed event contract, drives BullMQ queues through a Zod-validated worker harness, talks to WAHA through a per-method-circuit-breaker / TTL-cached / retried client, reads the NOWEB SQLite store read-only with per-session handles, ingests WAHA webhooks (HMAC-verified, immediately enqueued, normalized phone→LID, dispatched by event type), persists chats / messages / sessions with monthly-partitioned `messages`, reconciles outbound sends against the pending-message store, and emits typed `message:*` / `session:status` / `group:participants` events. All non-health HTTP routes sit under the `/api` global prefix.

## 2. Tech baseline

| Concern | Choice |
| --- | --- |
| Runtime | Node 20 LTS |
| Framework | NestJS 10 (Express HTTP adapter) |
| Language | TypeScript 5 (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`) |
| Validation | Zod (boundary validation only; no class-validator) |
| Logging | `nestjs-pino` (line-delimited JSON in prod, `pino-pretty` in dev) |
| Security headers | `helmet` |
| Persistence | PostgreSQL via `@nestjs/typeorm` 10 + TypeORM 0.3 (`pg` driver) |
| Migrations | TypeORM CLI; `synchronize: false` enforced in every env |
| Cache / coordination | Redis via `ioredis`; namespaced keys; `SET NX PX` distributed lock |
| Health | `@nestjs/terminus` indicators for Postgres + Redis |
| Auth | `@nestjs/jwt` (RS256 access tokens) + opaque refresh tokens, bcrypt cost 12, cookie via `cookie-parser` |
| Background work | BullMQ via `@nestjs/bullmq` (dedicated ioredis connection per worker, exponential retry, jobId-based idempotency, Zod-validated payloads through `WorkerHarness`) |
| External: WAHA | `axios` client wrapped by `WahaService` (per-method `CircuitBreaker`, `TtlCache` for sessions/status/chats, idempotent-GET retry, request timeouts) |
| External: NOWEB store | `better-sqlite3` opened read-only with per-session handles + 60s `TtlCache` for rowid / phone↔LID lookups |
| Webhook ingestion | `POST /api/webhooks/waha` (`@Public()`, Zod-validated, optional HMAC, immediate enqueue) → `webhook:waha` BullMQ queue → `WebhookProcessor` → dispatch table → domain handlers |
| Testing | Vitest + `@nestjs/testing` + Supertest |
| Lint / format | ESLint (`strict-type-checked` + `stylistic-type-checked`) + Prettier |
| CI | GitHub Actions (lint → typecheck → test → build) |
| Hooks | Husky pre-commit running `lint-staged` |

## 3. Top-level layout

```
backend/
├── src/
│   ├── main.ts                       Bootstrap: NestFactory, helmet, CORS, cookie-parser, body-parser, /api prefix, global filter, shutdown hooks.
│   ├── app.module.ts                 Composition root: Config + Logger + Database + Cache + Health + Users + Auth + TransactionRunner provider.
│   ├── config/                       Env parsing (Zod) + ConfigModule + LoggerModule + DI constants.
│   ├── common/                       Cross-cutting: middleware, filters, pipes, decorators, guards (JwtAuthGuard, AdminGuard).
│   ├── shared/                       Framework-agnostic: errors, branded ID types, Result helper, Express type augmentation.
│   ├── modules/
│   │   ├── users/                    UsersModule: User entity + UserRepository (camelCase ↔ snake_case via naming strategy).
│   │   ├── auth/                     AuthModule: login/refresh/logout/password-change, RS256 JWT, refresh rotation + family revocation, audit_log writes.
│   │   ├── sessions/                 SessionsModule (Phase 8): list/create/start/stop/delete/qr; mirrors WAHA session state into Postgres; webhook-driven status updates emit `session:status`.
│   │   ├── messages/                 MessagesModule (Phase 8): send/edit/delete/react/forward through WahaService; partitioned `messages` + sub-tables (reactions/edits/quotes/mentions/deleted); rowid-aware listing via WahaStoreService; reconciliation against PendingMessageStore.
│   │   ├── chats/                    ChatsModule (Phase 8): chat list (10s Redis cache via CacheService.wrap), dedup by id, ChatMetadataRepository, ChatPolicy stub (Phase 9 narrows).
│   │   └── webhooks/                 WebhooksModule (Phase 7): `POST /api/webhooks/waha`, Zod envelope + optional HMAC, immediate enqueue, dispatch table (real Phase-8 handlers).
│   ├── queues/                       BullMQ QueueModule (Phase 5+7): `forRootAsync` connection from REDIS_URL, registerQueue for `example` and `webhook:waha`, WorkerHarness, ExampleProcessor, WebhookProcessor.
│   ├── integrations/
│   │   ├── waha/                     Pure WahaClient (axios) + WahaService (per-method CircuitBreaker, TtlCache, retry).
│   │   └── waha-store/               WahaStoreService — read-only NOWEB SQLite reader (rowid + phone↔LID lookups).
│   ├── realtime/                     RealtimeModule: Socket.IO gateway with JWT handshake, room conventions, Redis adapter, Zod event contract (Phase 8 added message:*/session:status/group:participants).
│   └── infra/
│       ├── db/                       DatabaseModule, standalone CLI DataSource, SnakeNamingStrategy, withTransaction, migrations/, partitions.ts.
│       ├── cache/                    CacheModule, ioredis provider, CacheService, DistributedLockService.
│       └── health/                   HealthModule (/health/live, /health/ready via terminus DB + Redis probes).
├── scripts/                          One-shot CLI entry points (migrate, migrate-revert, seed).
├── test/                             Black-box integration tests against Nest applications.
├── docs/                             This documentation tree.
├── package.json                      Scripts + dependencies.
├── tsconfig.json                     Strict TS for editor + tests.
├── tsconfig.build.json               Build-time overrides (`rootDir: src`, excludes tests).
├── nest-cli.json                     Tells `nest build` to use `tsconfig.build.json`.
├── vitest.config.mts                 Vitest entry (ESM-only because of `vite-tsconfig-paths`).
├── eslint.config.mjs                 Flat ESLint config (includes the `name:` decorator-override ban).
├── .prettierrc / .prettierignore     Format rules.
├── .env.example                      Documented env surface.
└── .husky/pre-commit                 Runs lint-staged on staged TS files.
```

The project lives in a subdirectory under the repo root; the GitHub Actions workflow at `.github/workflows/ci.yml` `cd`s into `backend/` for all steps.

## 4. Composition root

`app.module.ts` imports — in order — `ConfigModule`, `LoggerModule`, `DatabaseModule`, `CacheModule`, `HealthModule`, `UsersModule`, `AuthModule`, `RealtimeModule`, `WahaModule`, `WahaStoreModule`, `SessionsModule`, `MessagesModule`, `ChatsModule`, `WebhooksModule`, then `QueueModule`. It also registers `TransactionRunner` as a provider and exports it so feature modules can inject a transactional context without importing TypeORM directly. It implements `NestModule.configure` to attach `CorrelationMiddleware` for every route. No global guards or interceptors are registered yet — auth is enforced per-controller via `@UseGuards(JwtAuthGuard)` with a `@Public()` opt-out for the login/refresh endpoints and the webhook ingress (the `@Public()` metadata is honoured by `JwtAuthGuard` itself).

`main.ts` is the only place the global exception filter is registered (`app.useGlobalFilters(new AllExceptionsFilter())`). It also:

- Calls `app.useLogger(app.get(Logger))` so Nest's internal logs flow through Pino.
- Disables `x-powered-by`.
- Conditionally enables `trust proxy` from env.
- Mounts `helmet()` then `cookieParser()` (cookie-parser must run before any handler reads `req.cookies` — the auth controller depends on it for the refresh cookie).
- Configures CORS from `CORS_ORIGINS` (wildcard becomes `origin: true`, otherwise a string array; `credentials: true`).
- Sets body-parser JSON + urlencoded limits from `BODY_LIMIT`.
- Calls `app.setGlobalPrefix('api', { exclude: [{ path: 'health/(.*)', method: RequestMethod.ALL }] })` so every business route lives under `/api/...` while `/health/live` and `/health/ready` stay at the root (orchestrator probes assume the bare path).
- Registers a body-parser `verify` callback that stashes the raw request body on `req.rawBody`. The webhook controller (`POST /api/webhooks/waha`) uses this buffer for timing-safe HMAC verification — touching `req.body` after Express has parsed it would lose the byte-exact representation the upstream signed.
- Registers `app.useWebSocketAdapter(new SocketRedisAdapter(app))` *before* `listen()` so the Socket.IO adapter is in place before any WS upgrade is accepted. The adapter pulls the existing ioredis client out of the cache module via DI — no second Redis connection is opened.
- Calls `app.enableShutdownHooks()` so the `CacheModule.OnApplicationShutdown` and Nest's TypeORM lifecycle close connections cleanly on SIGTERM.
- Installs process-level `unhandledRejection` / `uncaughtException` handlers that log and exit 1.

The Zod pipe is **not** registered globally. The plan dictates it is applied per parameter (`@Body(new ZodValidationPipe(Schema))` or the `@ZodBody` decorator) so the schema is always explicit at the call site.

## 5. Request lifecycle (current)

```
HTTP request
    │
    ▼
helmet → cookie-parser → CORS → body parser (express layer set up in main.ts)
    │
    ▼
pino-http (from nestjs-pino) — attaches req.log
    │
    ▼
CorrelationMiddleware
    • reuses X-Correlation-Id header if it parses as UUID
    • else generates randomUUID()
    • assigns req.correlationId, sets response X-Correlation-Id
    • rewraps req.log with a child carrying { correlationId }
    │
    ▼
Route resolution (under /api unless /health/* — see global prefix)
    │
    ▼
JwtAuthGuard (per-controller via @UseGuards)
    • short-circuits on @Public() metadata
    • else reads Authorization: Bearer …, verifies RS256
    • populates req.user = { id, email, role }
    │
    ▼
Controller (HealthController, AuthController)
    │
    ▼ on throw
AllExceptionsFilter
    • AppError       → status from .statusCode, body uses .code + .details
    • ZodError       → 400 VALIDATION_ERROR with mapped issues
    • HttpException  → its own status, code derived from numeric status
    • Anything else  → 500 INTERNAL_ERROR (stack stays server-side)
    │
    ▼
JSON envelope: { error: { code, message, correlationId, details? } }
```

Persistence-layer interactions sit *below* the controller and have their own internal flow:

```
service.method()
    ├── cache.wrap('key', loader, { ttlSeconds, schema })
    │     ├── Redis GET → hit → Zod parse → return
    │     └── miss → DistributedLockService SET NX PX → re-check cache → loader → set
    ├── tx.run(async (em) => { ...repository writes... })   // BEGIN / COMMIT / ROLLBACK
    └── return DTO
```

## 6. Error envelope contract

Every error response — regardless of source — has shape:

```
{
  "error": {
    "code": "STRING_CONSTANT",
    "message": "Human-readable summary",
    "correlationId": "uuid",
    "details": { … optional }
  }
}
```

Stack traces never leave the server. Detail keys are stable enough for clients to branch on (`details.issues` for validation, etc.). New error subclasses must extend `AppError` (see [modules/shared.md](modules/shared.md)).

## 7. Configuration boundary

Env is the only configuration input. It is parsed exactly once by `loadEnv` in `src/config/env.ts` at boot. Failure produces a multi-line summary written to stderr and an `Error` thrown out of the `ConfigModule` factory — Nest aborts startup before HTTP listens. Downstream code never reads `process.env` directly; everything injects `APP_CONFIG`.

Phase 2 added `DATABASE_URL`, `PG_POOL_MAX`, `PG_STATEMENT_TIMEOUT_MS`, `PG_IDLE_IN_TX_TIMEOUT_MS`, `PG_SSL`, `PG_SSL_REJECT_UNAUTHORIZED`, `PG_SSL_CA`, `REDIS_URL`, and `REDIS_KEY_PREFIX` to the schema. Phase 3 added the auth surface: `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_ACCESS_TTL_SECONDS`, `JWT_ISSUER`, `JWT_AUDIENCE`, `REFRESH_TTL_DAYS`, `REFRESH_COOKIE_NAME`, `REFRESH_COOKIE_PATH`, `REFRESH_COOKIE_SECURE`, `REFRESH_COOKIE_DOMAIN`, `BCRYPT_COST`. Phase 5 added the queue surface: `QUEUE_PREFIX`, `QUEUE_DEFAULT_ATTEMPTS`, `QUEUE_DEFAULT_BACKOFF_MS`, `QUEUE_REMOVE_ON_COMPLETE`, `QUEUE_REMOVE_ON_FAIL`. Phase 6 added the WAHA HTTP + SQLite surface: `WAHA_BASE_URL` (required), `WAHA_API_KEY?`, `WAHA_TIMEOUT_MS`, `WAHA_MEDIA_TIMEOUT_MS`, `WAHA_RETRY_MAX`, `WAHA_RETRY_BASE_MS`, `WAHA_CB_FAILURE_THRESHOLD`, `WAHA_CB_COOLDOWN_MS`, `WAHA_SESSIONS_CACHE_TTL_MS`, `WAHA_CHATS_CACHE_TTL_MS`, `WAHA_STATUS_CACHE_TTL_MS`, `WAHA_STORE_PATH` (required), `WAHA_STORE_REQUIRE_READONLY`, `WAHA_STORE_CACHE_TTL_MS`. Phase 7 added the webhook surface: `WAHA_WEBHOOK_HMAC_SECRET?`, `WAHA_WEBHOOK_HMAC_HEADER`, `PENDING_MESSAGE_TTL_MS`. PEM keys accept literal `\n` escapes and are normalized to real newlines by the loader. See [modules/config.md](modules/config.md) for the full schema and behaviour.

## 8. Observability baseline

Single logger, one process. Production = line-delimited JSON. Development = `pino-pretty`. Every log record carries `correlationId` when an HTTP request is in flight (via the child logger bound in `CorrelationMiddleware`). Health endpoints are excluded from `pino-http`'s auto-logging to keep noise out of dashboards. The terminus readiness payload (`{ status, info, error, details }`) follows the upstream `@nestjs/terminus` shape rather than the app's standard `{ status: "ok", ... }` liveness shape — clients must read both.

The redact list (see `src/config/constants.ts`) covers `authorization`, `cookie`, `x-api-key`, `password`, `token`, etc. Any later module that introduces a new secret-bearing field is expected to add it here.

## 9. Security baseline (current)

- `helmet()` defaults — CSP, HSTS, no-sniff, frame deny, referrer policy, etc.
- CORS allowlist from env. Wildcard only allowed in local dev.
- Body parser limit (default 2MB) keeps oversized payloads from reaching controllers.
- `x-powered-by` removed.
- Process-level uncaught error handlers exit non-zero so an orchestrator can restart.
- `DATABASE_URL` / `REDIS_URL` / `JWT_PRIVATE_KEY` only from env; never echoed (PEM keys are redacted via `*.password`/`*.token` paths in the pino redact list, plus the generic `authorization`/`cookie` rules — see `src/config/constants.ts`).
- Postgres `statement_timeout` (default 5s) and `idle_in_transaction_session_timeout` (default 30s) enforced server-side via the connection pool's `extra` options.
- TLS to Postgres in production (`PG_SSL=true` → `ssl: { rejectUnauthorized: true }`, optionally pinned via `PG_SSL_CA`).
- Redis distributed lock uses `SET NX PX` with a random per-acquire token; release uses an `EVAL` Lua script so a holder can only release its own token (and `EXTEND` only refreshes the holder's own lock).
- **Auth (Phase 3):**
  - Access tokens are **RS256 JWTs** signed/verified via `@nestjs/jwt`. TTL defaults to 15 minutes. Issuer + audience are pinned via `JWT_ISSUER` / `JWT_AUDIENCE`.
  - Refresh tokens are **opaque** (`<uuid>.<base64url-secret>`). Only the `bcrypt(secret)` hash is stored; the id half is used to look the candidate up in O(1) before a constant-time bcrypt compare.
  - Refresh tokens **rotate on every use**; the old row is flipped `revoked = true` with `replaced_by = <new>` inside a single `withTransaction`. Replay of an already-revoked token, or a wrong secret on a known id, **invalidates the entire token family** (`UPDATE refresh_tokens SET revoked = true WHERE family_id = ?`).
  - Passwords hash with **bcrypt cost 12** (configurable via `BCRYPT_COST`). A dummy hash is also compared on "user not found" to keep timing roughly equivalent to "wrong password".
  - Refresh cookie attributes: `HttpOnly; Secure; SameSite=Strict; Path=/api/auth` (`Secure` configurable via `REFRESH_COOKIE_SECURE` for local plain-HTTP dev only).
  - Append-only `audit_log` writes for `auth.login.success`, `auth.login.failure`, `auth.refresh.success`, `auth.refresh.reuse`, `auth.refresh.invalid`, `auth.logout`, `auth.password.change`. The table is range-partitioned monthly by `created_at`; `ensure_audit_log_partition(date)` materializes future partitions.
  - `JwtAuthGuard` enforces auth per-controller via `@UseGuards`. `@Public()` opts a handler out (used on `POST /api/auth/login`, `POST /api/auth/refresh`, and `POST /api/webhooks/waha`). `AdminGuard` (paired with optional `@Roles(...)`) restricts admin-only routes.
- **Webhook ingress (Phase 7):**
  - `POST /api/webhooks/waha` is `@Public()` but sits behind optional HMAC verification (`WAHA_WEBHOOK_HMAC_SECRET`). The signature is checked against `req.rawBody` (raw body captured by the body-parser `verify` hook) via `crypto.timingSafeEqual`; the `sha256=` prefix WAHA may send is stripped before comparison.
  - The controller validates the envelope with Zod, immediately enqueues to `webhook:waha` with `jobId = event.id` (queue-level dedupe across redelivery), and returns 200 in milliseconds. All real work runs in the `WebhookProcessor` worker.
  - The processor normalizes phone-format JIDs to LID through `WahaStoreService.phoneToLid`, then dispatches by event type. Unknown events log + ack so a misconfigured upstream doesn't cause retry storms.
  - Dedicated per-route rate limit class is planned for Phase 11.
- No rate limiting yet — planned in Phase 11.

## 10. Testing baseline

Vitest runs three groups today (196 tests, all green):

1. **Unit** — env parsing (incl. PEM `\n` normalization), exception filter mapping, correlation middleware, snake-case helper, `SnakeNamingStrategy` hooks, `withTransaction` commit/rollback/isolation, `CacheService.wrap` (hit, miss, error path, lock contention fallback), `DistributedLockService` (acquire, retry, release, expired release), `AuthService` (login + refresh rotation + family revocation + change-password + logout + parseRefreshToken edge cases), `JwtAuthGuard` / `AdminGuard`, Zod auth schemas, `WorkerHarness` (Zod parse + correlation log fields + retry behaviour), `ExampleProcessor` / `ExampleQueueProducer` (jobId idempotency), `buildQueueOptions` (URL parsing, maxRetriesPerRequest, defaults), `TtlCache` (TTL expiry, stampede single-flight), `CircuitBreaker` (closed→open→half-open→closed state machine), `WahaClient` (axios round-trip + 5xx/4xx error wrapping against a local HTTP stub), `WahaService` (cache + retry + circuit + mutation no-retry + invalidation), `WahaStoreService` (read-only handle, rowid sort, JID lookups, bootstrap read-only check), `WebhooksService` (HMAC verify incl. sha256= prefix + tampered + missing inputs, enqueue jobId), `WebhookDispatch` (every event type routes, unknown ack-only, handler errors propagate), `WebhookProcessor` (phone→LID normalization across nested payloads, invalid envelope rejection), `WebhooksController` (HMAC gate + envelope plumbing), `PendingMessageStore` (TTL writes + isPending + resolve return value), `dedupeChats` (LID preference w/ phone↔LID aliasing), `sortByRowid` (null rowids sink, stable tiebreak), `ChatPolicy` (admin/developer stub), `SessionsService` (create/stop/applyStatusUpdate), `MessagesService.upsertFromWebhook` (pending-resolves-silently vs novel-emits-message:new).
2. **Integration** (`test/health.e2e-spec.ts`, `test/realtime.e2e-spec.ts`) — boot minimal Nest apps that exercise the live probe + 404 envelope and the Socket.IO handshake + room behaviour without requiring real Postgres / Redis. End-to-end Testcontainers Postgres + Redis + WAHA-stub coverage (full login → refresh → logout, send → reconcile, queue round-trip, cross-pod adapter fanout) is deferred to Phase 12.
3. **Coverage** — V8 provider, excludes `*.module.ts`, `*.d.ts`, and `main.ts`.

Path alias `@app/*` → `src/*` works in both `tsc` and Vitest (the latter via `vite-tsconfig-paths`). All persistence + auth unit tests use in-memory fakes (mocked `QueryRunner`, in-memory Redis double, in-memory token/audit map, mocked `JwtService`) — no Docker required.

## 11. Scripts (`package.json`)

| Script | Action |
| --- | --- |
| `start:dev` | `nest start --watch` (development server with `pino-pretty`). |
| `build` | `rimraf dist && nest build` — emits `dist/main.js`. |
| `start:prod` | `node dist/main.js`. |
| `lint` / `lint:fix` | Strict ESLint over `src` and `test`. |
| `typecheck` | `tsc --noEmit` against the dev tsconfig. |
| `test` / `test:watch` / `test:cov` | Vitest run / watch / coverage. |
| `format` | Prettier write. |
| `migrate` | Apply pending TypeORM migrations against `DATABASE_URL`. |
| `migrate:revert` | Revert the last applied migration. |
| `migrate:generate -- src/infra/db/migrations/<Name>` | Generate a migration from entity diff. |
| `migrate:create -- src/infra/db/migrations/<Name>` | Create an empty migration file. |
| `migrate:show` | List applied / pending migrations. |
| `seed` | Idempotently upserts the default admin (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`; defaults to `admin@test.com` / `password123`). |
| `typeorm` | Direct TypeORM CLI passthrough (`ts-node -r tsconfig-paths/register …`). |
| `prepare` | Installs Husky hooks from the repo root. |

## 12. CI

`.github/workflows/ci.yml` runs on push to `main` and on every pull request. It installs npm deps via `npm ci`, then runs `lint`, `typecheck`, `test`, and `build` from `backend/`. Failures gate merges.

## 12a. Frontend integration contract

The frontend (`../frontend/`) consumes this backend and depends on a small, stable surface that is already wired today. This section is the authoritative cross-process contract — change anything below in lock-step on both sides.

### Network topology (local dev)

| Process | Port | Source |
| --- | --- | --- |
| Backend HTTP / WebSocket | `3005` | `PORT` env (`src/config/env.ts`) |
| Frontend Vite dev server | `5173` | `vite.config.ts` |
| CORS allow-list | `http://localhost:5173` | `CORS_ORIGINS` env default |
| Frontend `VITE_API_BASE_URL` | `http://localhost:3005` | `frontend/.env.example` |
| Frontend `VITE_SOCKET_URL` | `http://localhost:3005` | `frontend/.env.example` |

Production / staging override `CORS_ORIGINS` and the frontend's `VITE_*` to real hostnames. The relationship — frontend origin appears in `CORS_ORIGINS`, frontend `VITE_API_BASE_URL` points at the backend — is invariant.

### HTTP envelope (load-bearing)

Every response from `AllExceptionsFilter` (`src/common/filters/all-exceptions.filter.ts`) is shaped as:

```json
{ "error": { "code": "<STRING_CONSTANT>", "message": "...", "correlationId": "<uuid>", "details": { ... } } }
```

The frontend's planned `AppApiError` (architecture §9.1, Phase 3) decodes exactly this shape. Stable `code` values today:
- `VALIDATION_ERROR` — ZodError, 400. `details.issues = Array<{ path, message, code }>`.
- `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `UNPROCESSABLE_ENTITY`, `RATE_LIMITED`, `HTTP_ERROR` — `HttpException` derived from status.
- `INTERNAL_ERROR` — anything else, 500.
- Future `AppError` subclasses (auth, sessions, etc.) ship their own `code` constants.

Successful 2xx responses are free-form per endpoint and validated by the frontend's per-feature Zod schemas. Do **not** introduce a wrapping envelope around success payloads — the frontend's `apiClient` (Phase 3) expects raw bodies.

### Correlation header

`x-correlation-id` is honoured on the request and echoed on the response (`src/common/middleware/correlation.middleware.ts`). Frontend convention is to attach `X-Correlation-Id` per request (Phase 11 observability) and surface it in error toasts; HTTP header lookup is case-insensitive so both casings work. If the inbound value is not a UUID, the middleware generates a new one — clients must read the echoed value, never assume their own.

### Cookies, credentials, CSRF

- CORS is configured with `credentials: true` (`src/main.ts`).
- Frontend HTTP client uses `withCredentials: true`.
- Phase 3 auth issues an httpOnly refresh cookie on login + refresh; access tokens are returned in the JSON body and stay in memory only.
- Cookie attributes (live): `HttpOnly; Secure; SameSite=Strict; Path=/api/auth` (cookie name configurable via `REFRESH_COOKIE_NAME`, default `dd_refresh`; `REFRESH_COOKIE_SECURE=false` only for local plain-HTTP dev; optional `REFRESH_COOKIE_DOMAIN` for parent-domain serving). `SameSite=Strict` is correct because the refresh endpoint is only ever called by first-party JS from the frontend SPA. Cross-site deployments where the SPA and API live on unrelated eTLD+1s must reconfigure to `SameSite=None; Secure` deliberately.
- CSRF: the frontend never reads cookies from JS (refresh cookie is httpOnly); the access token in `Authorization: Bearer` is not vulnerable to CSRF. `SameSite=Strict` blocks cross-site refresh attempts at the browser layer.

### Health endpoints (frontend may probe)

- `GET /health/live` → `200 { status: 'ok', uptimeSeconds, timestamp }`. Cheap, no I/O.
- `GET /health/ready` → terminus shape, performs DB + Redis ping. Use for orchestrator readiness; do not call from the UI on every render.

### Endpoints not yet built (phase-ordered gap)

The frontend's later phases assume these endpoints. They land in the corresponding backend phases — until then the frontend feature blocks behind its own phase boundary.

| Frontend phase | Endpoints / channels expected | Backend phase |
| --- | --- | --- |
| 3 — auth | `POST /api/auth/login`, `POST /api/auth/refresh` (cookie), `POST /api/auth/logout`, `PATCH /api/auth/password` — all live. `GET /api/auth/me` not yet built; user profile is currently embedded in the login/refresh response body. | 3 — Auth (✅) |
| 5 — realtime core | Socket.IO over `websocket` transport, handshake `{ auth: { token } }`, server-emitted `error:invalid_payload`. `GET /api/sync?since=<seq>` still planned. | 4 — Realtime (✅) |
| 7 — chats | `GET /api/chats?session=<n>`, `POST /api/chats/:chatId/read`, `POST /api/chats/sync?session=<n>` — live. Mute toggle deferred to Phase 9. | 8 — Domain (✅) |
| 8 — messages | `GET /api/messages/:chatId?session=<n>`, `POST /api/messages/:chatId/send`, `POST /api/messages/:chatId/media`, `PATCH /api/messages/:chatId/:stanzaId`, `DELETE /api/messages/:chatId/:stanzaId`, `POST /api/messages/:chatId/:stanzaId/react`, `POST /api/messages/:chatId/:stanzaId/forward` — live. `GET /api/chats/:chatId/participants` still planned (WAHA call wrapper). | 8 — Domain (✅) |
| 8 — sessions | `GET/POST /api/sessions`, `GET /api/sessions/:name`, `POST /api/sessions/:name/start`, `POST /api/sessions/:name/stop`, `DELETE /api/sessions/:name`, `GET /api/sessions/:name/qr` — live (all admin-gated). | 8 — Domain (✅) |
| 9 — admin | `GET/POST/DELETE /api/assignments`, `GET/POST/PATCH/DELETE /api/users`, `PATCH /api/mute/global`, `GET/PATCH /api/feedback` — planned Phase 9. | 9 — Collaboration |

Webhook ingress (server-to-server, not for the frontend): `POST /api/webhooks/waha` — `@Public()`, optional `X-Webhook-Hmac` header (hex SHA-256 of raw body, accepts `sha256=` prefix), Zod-validated envelope `{ id, event, session, payload, ... }`, returns 200 with `{ accepted: true }` after enqueue. Webhook events dispatched: `message`, `message.any`, `message.ack`, `message.edited`, `message.reaction`, `message.revoked`, `session.status`, `group.v2.participants` (others log + ack).

Socket events the frontend will register handlers for (phase-ordered, names from `FRONTEND_ARCHITECTURE.md §6` and `FRONTEND_IMPLEMENTATION_PLAN.md` phases 7–9): `message:new`, `message:ack`, `message:edited`, `message:deleted`, `message:reaction`, `session:status`, `group:participants` (all live as of Phase 8); `chat:assigned`, `chat:unassigned`, `chat:read`, `chat:muted` (Phase 9); `auth:ready`, `auth:logged-out` (planned). Mirror the payload Zod schemas in `realtime/events.contract.ts` on the frontend side; both ends must agree.

### Body limits

`BODY_LIMIT` (default `2mb`) is fine for chat-text traffic. Frontend Phase 8 introduces media uploads (images, audio, documents); raise the limit explicitly for those endpoints or switch to a presigned-upload pattern. Do not silently bump the global limit.

### Observability beacons (Phase 11)

The frontend's Phase 11 wires `navigator.sendBeacon` to a backend endpoint for Web Vitals + custom metrics. The endpoint does not exist yet; plan it under `infra/observability/` when Phase 11 of either side lands. Payload contract is the frontend's responsibility (Zod-validated client-side before send); backend just persists / forwards.

### Invariants the backend will not break without a coordinated migration

- Error envelope shape and `code` constants.
- `x-correlation-id` middleware behaviour (echo a valid UUID, generate otherwise).
- `credentials: true` CORS + `CORS_ORIGINS` honouring the frontend origin.
- `synchronize: false` (frontend never assumes ad-hoc schema drift — every state change is a migration).
- Stack traces never leave the server.

If any of these change, update this section and the frontend's [docs/context.md](../../frontend/docs/context.md) §9 in the same change-set.

## 13. Module map

| Area | Doc | Status |
| --- | --- | --- |
| Bootstrap (`main.ts`, `AppModule`) | [modules/bootstrap.md](modules/bootstrap.md) | ✅ Phases 1–8 wiring |
| ConfigModule + env parsing | [modules/config.md](modules/config.md) | ✅ Phases 1–7 surface |
| LoggerModule (`nestjs-pino`) | [modules/logger.md](modules/logger.md) | ✅ Phase 1 |
| Common (middleware, filter, pipe, decorators, guards) | [modules/common.md](modules/common.md) | ✅ Phase 1 + 3 |
| Shared (errors, branded IDs, Result, Express types) | [modules/shared.md](modules/shared.md) | ✅ Phase 1 |
| DatabaseModule (TypeORM, naming, transactions, migrations, partitions) | [modules/db.md](modules/db.md) | ✅ Phase 2 + 3 + 8 (migration 0003 messaging) |
| CacheModule (Redis client, CacheService, DistributedLockService) | [modules/cache.md](modules/cache.md) | ✅ Phase 2 |
| HealthModule | [modules/health.md](modules/health.md) | ✅ Phase 2 (terminus DB + Redis) |
| UsersModule | [modules/users.md](modules/users.md) | ✅ Phase 3 |
| AuthModule | [modules/auth.md](modules/auth.md) | ✅ Phase 3 |
| RealtimeModule | [modules/realtime.md](modules/realtime.md) | ✅ Phase 4 + 8 events |
| QueueModule (BullMQ, WorkerHarness, processors) | [modules/queues.md](modules/queues.md) | ✅ Phase 5 + 7 |
| WahaModule (resilience-wrapped HTTP client) | [modules/waha.md](modules/waha.md) | ✅ Phase 6 |
| WahaStoreModule (read-only NOWEB SQLite reader) | [modules/waha-store.md](modules/waha-store.md) | ✅ Phase 6 |
| WebhooksModule (ingress + dispatch table) | [modules/webhooks.md](modules/webhooks.md) | ✅ Phase 7 + 8 handlers |
| SessionsModule | [modules/sessions.md](modules/sessions.md) | ✅ Phase 8 |
| MessagesModule | [modules/messages.md](modules/messages.md) | ✅ Phase 8 |
| ChatsModule | [modules/chats.md](modules/chats.md) | ✅ Phase 8 |

Future phases will add their own entries to this table.

## 14. Conventions an editor must respect

- **Validation lives at the boundary.** All HTTP and WebSocket inputs are validated through Zod (per-parameter pipes, never globally). Internal calls trust their types.
- **No `process.env` outside `config/env.ts`.** Every other module gets values via `APP_CONFIG`.
- **No stack traces in responses.** The filter normalises everything; do not surface `error.stack` or unsanitised messages.
- **Branded IDs for cross-boundary identifiers.** Use `UserId`, `ChatId`, `MessageId`, `SessionId` from `shared/types/ids.ts` whenever an identifier crosses a module boundary.
- **Path alias.** Imports inside `src/` should use `@app/...` (e.g. `@app/shared/errors`) rather than long relative paths.
- **Optional fields.** Because `exactOptionalPropertyTypes` is on, never pass `undefined` to an optional property — omit the key (`...(value === undefined ? {} : { value })`).
- **`synchronize: false` is permanent.** Schema only changes through migrations in `src/infra/db/migrations/`. Never edit the option.
- **Naming strategy is the only casing authority.** Entity properties are camelCase; the database is snake_case. Do **not** pass `name:` to `@Column`, `@JoinColumn`, or `@JoinTable` — ESLint (`no-restricted-syntax`) flags it. For unavoidable legacy mappings add `// naming-override: <reason>` and `// eslint-disable-next-line no-restricted-syntax`.
- **Transactions go through `TransactionRunner.run(async (em) => …)`** (or the standalone `withTransaction(dataSource, …)` outside Nest DI). Do not call `dataSource.transaction(...)` directly — the helpers preserve commit / rollback / release semantics in one place.
- **Cache reads through `CacheService.wrap`.** Always provide a Zod schema so cached payloads from previous deploys cannot poison the typed surface.
- **Auth on by default.** Controllers under `/api` should be guarded with `@UseGuards(JwtAuthGuard)` at the class or method level. Only explicitly public endpoints (e.g. login, refresh, public webhooks) carry the `@Public()` decorator. Admin-only endpoints add `@UseGuards(JwtAuthGuard, AdminGuard)` (optionally narrowed by `@Roles(UserRole.ADMIN)`).
- **Append-only audit log.** Sensitive state changes (login attempts, password change, logout, future user disable / assignment changes) must call `AuthRepository.writeAudit(event, userId, payload?)`. Never update or delete rows in `audit_log`.

## 15. How to add a new module (for now)

The persistence + cache scaffolding is in place; new modules can already depend on TypeORM repositories and Redis. Procedure:

1. Create the module under `src/modules/<name>/` (or `src/infra/<name>/` for infrastructure-only modules).
2. Implement the controller, the service, the entity (if persistent), the repository, and any domain types.
3. Validate every input through Zod schemas placed alongside the controller (`<name>.schema.ts`).
4. Throw `AppError` subclasses; never `throw new Error(...)` from controllers/services.
5. If the module owns persistent state, add the entity under `src/modules/<name>/<entity>.entity.ts`, then generate a migration with `npm run migrate:generate -- src/infra/db/migrations/<Name>` and check it in.
6. Register the module in `AppModule`. Persistent modules typically `imports: [TypeOrmModule.forFeature([Entity])]`.
7. For cached reads, use `CacheService.wrap` with a namespaced key (e.g. `chats:user:<id>`); for cross-replica coordination, use `DistributedLockService.with(...)`.
8. Add tests under `src/modules/<name>/*.spec.ts` and, where useful, an `*.e2e-spec.ts` in `test/`.
9. Add a new `docs/modules/<name>.md` file and link it from the table in section 13 of this document.
