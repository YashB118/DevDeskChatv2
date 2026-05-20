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
| `PG_SSL` | boolish | `false` | When true, TypeORM connects with `ssl: { rejectUnauthorized: true }`. Must be `true` in production. |

### Redis

| Variable | Type | Default | Notes |
| --- | --- | --- | --- |
| `REDIS_URL` | URL | *required* | `redis://host:port` (or `rediss://...` for TLS). |
| `REDIS_KEY_PREFIX` | non-empty string | `devdesk:` | Applied to every key issued through the ioredis client (the prefix is **not** included in keys passed to `EVAL` — beware when writing Lua manually). |

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

When extending the schema, add equivalent coverage.

## 10. Dependencies

- `zod` for parsing.
- `@nestjs/common` for `@Global` / `@Module`.
- `dotenv` is consumed only by the standalone `datasource.ts` for CLI ergonomics — not by `ConfigModule`.

This module sits at the bottom of the dependency graph; no other module may import from it transitively in ways that create cycles.

## 11. Future evolution

Anticipated additions in later phases:

- `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `BCRYPT_COST`, refresh-token lifetimes (Phase 3).
- `FRONTEND_URL` for the Socket.IO CORS allowlist (Phase 4).
- `WAHA_BASE_URL`, `WAHA_API_KEY`, `WAHA_STORE_PATH` (Phase 6).
- Rate-limit knobs, feature flags (Phase 11).

All of these enter through the same schema; do not split into multiple config files.
