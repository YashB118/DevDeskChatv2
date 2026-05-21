# Module — Config

> Owns environment parsing and the single DI surface every other module uses to read configuration values.

**Files**
- `src/config/env.ts` — Zod schema + `loadEnv` parser.
- `src/config/config.module.ts` — `@Global()` Nest module exposing `APP_CONFIG`.
- `src/config/constants.ts` — DI tokens and the logger redact list (declared here to avoid cross-module imports).
- `.env.example` — documented surface for developers and ops.

This module deliberately holds **no** business logic. Its only job is to fail fast on bad configuration and to expose a typed, validated object.

---

## 1. Responsibility

- Parse and validate every environment variable the app understands.
- Reject startup with a clear, multi-line error when validation fails.
- Provide one read-only object to the rest of the app via the `APP_CONFIG` DI token.
- Centralise constants that need to be referenced across modules but are not themselves configuration (chiefly the Pino redact list).

## 2. Environment schema

The current schema accepts these variables. Required variables have no default — if missing the parser rejects startup.

### Process / HTTP

| Variable | Type | Default | Notes |
| --- | --- | --- | --- |
| `NODE_ENV` | enum `development` / `test` / `production` | `development` | Drives Pino transport selection and other future behaviours. |
| `PORT` | integer in `(0, 65535]` | `3005` | Coerced from string. |
| `LOG_LEVEL` | enum (`fatal`/`error`/`warn`/`info`/`debug`/`trace`/`silent`) | `info` | Passed to Pino. `debug`/`trace` also enable TypeORM query logging. |
| `APP_NAME` | non-empty string | `devdeskchat-backend` | Becomes the Pino `name` field. |
| `CORS_ORIGINS` | comma-separated string | `http://localhost:3005` | Parsed into `string[]`. Use `*` only in local dev. |
| `BODY_LIMIT` | size string accepted by Express | `2mb` | Applied to both JSON and urlencoded bodies. |
| `TRUST_PROXY` | boolish (`true`/`false`/`1`/`0`) | `false` | When true, `app.set('trust proxy', 1)` is called. |

### Postgres

| Variable | Type | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | URL | *required* | `postgres://user:pass@host:port/db`. Never echoed; absent from log records via redaction. |
| `PG_POOL_MAX` | integer in `(0, 200]` | `20` | Maximum pool size per pod. Watch cluster-wide total when scaling horizontally; introduce PgBouncer when total active connections approach Postgres `max_connections`. |
| `PG_STATEMENT_TIMEOUT_MS` | positive integer | `5000` | Server-side per-statement timeout for HTTP-facing queries. |
| `PG_IDLE_IN_TX_TIMEOUT_MS` | positive integer | `30000` | Kills sessions left idle inside a transaction (defends against forgotten `BEGIN`). |
| `PG_SSL` | boolish | `false` | When true, TypeORM connects with TLS. Auto-promoted to true when `DATABASE_URL` carries `sslmode=require/verify-ca/verify-full`. Must be `true` in production. |
| `PG_SSL_REJECT_UNAUTHORIZED` | boolish | `true` | Server-cert verification. Set `false` only when local dev hits a managed cloud whose CA is not in Node's trust store AND `PG_SSL_CA` is also unavailable. Pinning a CA via `PG_SSL_CA` overrides this back to `true`. |
| `PG_SSL_CA` | PEM string | optional | Pinned CA certificate (or chain). Forces verification on. Multi-line PEM must be wrapped in double quotes in `.env`. |

### Redis

| Variable | Type | Default | Notes |
| --- | --- | --- | --- |
| `REDIS_URL` | URL | *required* | `redis://host:port` (or `rediss://...` for TLS). |
| `REDIS_KEY_PREFIX` | non-empty string | `devdesk:` | Applied to every key issued through the ioredis client (the prefix is **not** included in keys passed to `EVAL` — beware when writing Lua manually). |

### Auth — JWT (RS256)

| Variable | Type | Default | Notes |
| --- | --- | --- | --- |
| `JWT_PRIVATE_KEY` | PEM string | *required* | RS256 signing key. The loader normalizes literal `\n` escapes back to real newlines so single-line `.env` values stay readable. Must include `-----BEGIN`/`-----END` markers. |
| `JWT_PUBLIC_KEY` | PEM string | *required* | RS256 verification key. Same normalization. Used by `JwtAuthGuard.verifyAsync`. |
| `JWT_ACCESS_TTL_SECONDS` | positive integer | `900` | Access-token TTL (15 min by default). Forwarded to `JwtModule.signOptions.expiresIn`. |
| `JWT_ISSUER` | non-empty string | `devdeskchat` | Signed into `iss`; enforced on verify. Use distinct values per environment. |
| `JWT_AUDIENCE` | non-empty string | `devdeskchat-clients` | Signed into `aud`; enforced on verify. |

Generate keys locally with `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt.key && openssl rsa -in jwt.key -pubout -out jwt.key.pub`. Production should source these from the platform's secret manager / KMS-managed key store and rotate by re-issuing both keys together (RS256 verify can accept the old public key during overlap if the deployment platform exposes a multi-key verify path; today we only carry one).

### Auth — refresh tokens + cookie

| Variable | Type | Default | Notes |
| --- | --- | --- | --- |
| `REFRESH_TTL_DAYS` | positive integer | `30` | Lifetime of an issued refresh token row. Sliding (every rotation re-extends). |
| `REFRESH_COOKIE_NAME` | non-empty string | `dd_refresh` | Cookie name. Renaming requires a coordinated rollout because old cookies cease to be sent. |
| `REFRESH_COOKIE_PATH` | non-empty string | `/api/auth` | Cookie `Path` attribute. Scopes the cookie to the auth endpoints so unrelated routes do not see it. |
| `REFRESH_COOKIE_SECURE` | boolish | `true` | `Secure` cookie attribute. Set `false` ONLY for local plain-HTTP dev. |
| `REFRESH_COOKIE_DOMAIN` | string | optional | Cookie `Domain` attribute. Set when serving over a parent domain (e.g. `.example.com`); leave unset for host-only cookies. |

The cookie also carries `HttpOnly` and `SameSite=Strict` unconditionally — these are not configurable.

### Auth — password hashing

| Variable | Type | Default | Notes |
| --- | --- | --- | --- |
| `BCRYPT_COST` | integer in `[4, 15]` | `12` | bcrypt work factor for both password hashes and refresh-token secret hashes. Lower (e.g. `4`) only in tests; production stays at `12` or higher. |

Whenever a new variable is added:

1. Extend the `EnvSchema` in `env.ts` with the appropriate Zod constraint (prefer `z.coerce` for numerics).
2. Add the variable to `.env.example` with a comment.
3. Add a test case to `src/config/env.spec.ts` that covers parsing and at least one failure mode.
4. Document the variable in the table above.

## 3. `loadEnv`

`loadEnv(source = process.env)` is the single entry point. It returns a plain `AppConfig` object on success and throws (after writing a formatted summary to stderr) on failure. Tests pass synthetic environments through the `source` argument to keep `process.env` untouched.

`AppConfig` is `z.infer<typeof EnvSchema>` — the type and runtime contract cannot drift.

`loadEnv` is called from two places:

- `ConfigModule`'s factory at Nest bootstrap.
- `src/infra/db/datasource.ts`, the standalone DataSource used by the TypeORM CLI. That file also calls `dotenv.config()` before `loadEnv` so `npm run migrate` works without an explicit `--env-file` flag.

## 4. `ConfigModule`

- Decorated `@Global()` so any module can inject `APP_CONFIG` without importing `ConfigModule` directly.
- The provider is a `useFactory` that calls `loadEnv()` exactly once during Nest's instantiation pass. If parsing fails, the factory throws and Nest aborts startup before HTTP listens — there is no partially-configured state.
- The module exports the `APP_CONFIG` provider and nothing else.

## 5. `APP_CONFIG` token

- Declared as a `Symbol` in `src/config/constants.ts` so accidental string collisions are impossible.
- Inject with `@Inject(APP_CONFIG) private readonly config: AppConfig`.
- Treat `AppConfig` as immutable. Never mutate the object; never replace it at runtime.

## 6. `REDACT_PATHS`

The redact list lives in `constants.ts` and is consumed by `LoggerModule` (see [logger.md](logger.md)). It is kept here rather than inside the logger module to make it easy for any future module to add fields without creating a circular import. When a module introduces a new secret-bearing payload field (`apiKey`, `webhookSecret`, …), add it to this list.

## 7. Why `@nestjs/config` is not used

The project standardises on Zod for boundary validation. `@nestjs/config` is intentionally not used because:

- It encourages duplicated validation (joi + class-validator).
- It does not natively coerce + parse complex shapes (arrays from CSV, booleans from strings) without a custom transformer.
- Keeping a single parser keeps the failure message format consistent.

If a future need for hierarchical/nested config arises, prefer extending the Zod schema and helpers rather than introducing a second source of truth.

## 8. Failure behaviour

A bad environment produces output like:

```
Invalid environment configuration:
  - DATABASE_URL: Required
  - PORT: Number must be less than or equal to 65535
  - LOG_LEVEL: Invalid enum value. Expected …
```

… followed by a thrown `Error` that propagates out of Nest's bootstrap. Process exits non-zero. Orchestrator restarts the container. The user-facing log is intentionally written via `console.error` because the Pino logger depends on this config to initialise.

## 9. Tests

`src/config/env.spec.ts` covers:

- Required-vars-only source → all defaults applied.
- `PORT` string coercion.
- Out-of-range `PORT` → rejection.
- Unknown `LOG_LEVEL` → rejection.
- CSV splitting and trimming for `CORS_ORIGINS`.
- Boolean parsing for `TRUST_PROXY` (string and numeric forms).
- Missing `DATABASE_URL` → rejection.
- Missing `REDIS_URL` → rejection.
- Malformed `DATABASE_URL` → rejection.
- Missing `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` → rejection.
- Escaped `\n` sequences in PEM keys normalize to real newlines.

When extending the schema, add equivalent coverage.

## 10. Dependencies

- `zod` for parsing.
- `@nestjs/common` for `@Global` / `@Module`.
- `dotenv` is consumed only by the standalone `datasource.ts` for CLI ergonomics — not by `ConfigModule`.

This module sits at the bottom of the dependency graph; no other module may import from it transitively in ways that create cycles.

## 11. Phase 5–11 additions

Already live in the schema:

- **Queues (Phase 5):** `QUEUE_PREFIX`, `QUEUE_DEFAULT_ATTEMPTS`, `QUEUE_DEFAULT_BACKOFF_MS`, `QUEUE_REMOVE_ON_COMPLETE`, `QUEUE_REMOVE_ON_FAIL`.
- **WAHA HTTP client (Phase 6):** `WAHA_BASE_URL` (required), `WAHA_API_KEY?`, `WAHA_TIMEOUT_MS`, `WAHA_MEDIA_TIMEOUT_MS`, `WAHA_RETRY_MAX`, `WAHA_RETRY_BASE_MS`, `WAHA_CB_FAILURE_THRESHOLD`, `WAHA_CB_COOLDOWN_MS`, `WAHA_SESSIONS_CACHE_TTL_MS`, `WAHA_CHATS_CACHE_TTL_MS`, `WAHA_STATUS_CACHE_TTL_MS`.
- **WAHA NOWEB SQLite store (Phase 6):** `WAHA_STORE_PATH` (required), `WAHA_STORE_REQUIRE_READONLY` (default `false`; flip to `true` in prod where the file is mounted read-only), `WAHA_STORE_CACHE_TTL_MS`.
- **Webhook ingestion (Phase 7):** `WAHA_WEBHOOK_HMAC_SECRET?` (optional — unset disables HMAC verification), `WAHA_WEBHOOK_HMAC_HEADER` (default `x-webhook-hmac`), `PENDING_MESSAGE_TTL_MS` (default 9000ms — must outlive the WAHA round-trip + webhook delivery latency).
- **Observability (Phase 10):** `OTEL_ENABLED` (default `false`), `OTEL_SERVICE_NAME` (default `devdeskchat-backend`), `OTEL_EXPORTER_OTLP_ENDPOINT?` (OTLP HTTP collector URL — unset = SDK runs without exporter, spans dropped), `OTEL_TRACES_SAMPLER_RATIO` (default `1`, range 0..1 for `TraceIdRatioBasedSampler`), `METRICS_BEARER_TOKEN?` (gates `GET /metrics` — unset = endpoint refuses every request), `HEALTH_WAHA_CACHE_TTL_MS` (default 15000), `HEALTH_WAHA_TIMEOUT_MS` (default 2500). Note: `telemetry.ts` is the **single** approved violator of the "no `process.env` outside `env.ts`" rule because it must run before `loadEnv`.
- **Security hardening (Phase 11):** `RATE_LIMIT_ENABLED` (default `true`; master toggle, both rate-limit interceptors short-circuit when false), `REQUEST_TIMEOUT_MS` (default `30000`; `RequestTimeoutInterceptor` budget), `RATE_LIMIT_IP_WINDOW_SECONDS` / `RATE_LIMIT_IP_MAX` (default `60` / `600`; global IP floor), `RATE_LIMIT_USER_WINDOW_SECONDS` / `RATE_LIMIT_USER_MAX` (default `60` / `300`; per-authenticated-user floor), `RATE_LIMIT_AUTH_WINDOW_SECONDS` / `RATE_LIMIT_AUTH_MAX` (default `900` / `5`; per-email login attempts on `POST /api/auth/login`), `RATE_LIMIT_SEND_WINDOW_SECONDS` / `RATE_LIMIT_SEND_MAX` (default `10` / `30`; per-user budget on `POST /api/messages/:chatId/send|media|forward`), `RATE_LIMIT_CHATS_WINDOW_SECONDS` / `RATE_LIMIT_CHATS_MAX` (default `5` / `10`; soft budget on `GET /api/chats` — serves the `CacheService.wrap` blob with `X-RateLimit-Cached: true`), `HSTS_MAX_AGE_SECONDS` (default `63072000`; helmet HSTS `max-age`).

## 12. Future evolution

Anticipated additions in later phases:

- Per-route limiter knobs for the webhook ingress if WAHA delivery patterns demand a dedicated higher-burst cap (Phase 11+).
- Backend beacons endpoint config for the frontend Phase 11 observability surface.

All of these enter through the same schema; do not split into multiple config files.
