# Module — Logger

> Structured logging surface for the entire process. Wraps `nestjs-pino` so every controller, service, middleware, and future job worker emits through a single pipeline with consistent fields, redaction, and correlation propagation.

**Files**
- `src/config/logger.module.ts` — declares the `LoggerModule` (re-exports `nestjs-pino`'s `LoggerModule.forRootAsync`).
- `src/config/constants.ts` — owns the redact list (`REDACT_PATHS`).

---

## 1. Responsibility

- Configure `nestjs-pino` from `APP_CONFIG`.
- Decide the transport (JSON in prod, `pino-pretty` in dev).
- Apply the redact list to every log record.
- Suppress access logs for `/health/live` and `/health/ready`.
- Attach a `correlationId` field to every request-scoped log via Pino's `customProps`.

## 2. Composition

`LoggerModule` is a thin `@Module` that imports `PinoLoggerModule.forRootAsync({ ... })`. It depends on `ConfigModule` (to inject `APP_CONFIG`) and re-exports `PinoLoggerModule` so consuming modules get both the request logger and the `Logger` provider.

Two logger surfaces become available everywhere:

- `app.get(Logger)` — the application-level Pino logger (used by `main.ts` to print the bootstrap line and as Nest's framework logger).
- `request.log` — a request-scoped Pino child logger attached by `pino-http`. `CorrelationMiddleware` re-wraps this child to bind `correlationId`.

Controllers and services should prefer `req.log` (forwarded explicitly or via custom interceptors in later phases). Background workers (Phase 5) will construct their own child loggers from the application logger and the job's correlation id.

## 3. Configuration semantics

The factory produces a `pinoHttp` options object. Key fields:

- `level` — taken from `LOG_LEVEL`.
- `name` — taken from `APP_NAME`; appears on every record so multi-service log aggregation can disambiguate.
- `redact` — `{ paths: REDACT_PATHS, remove: true }`. `remove: true` causes the field to vanish entirely instead of being replaced with `[REDACTED]`. The remove semantics are deliberate; the existence of a sensitive field is itself signal we do not want to leak.
- `autoLogging.ignore` — suppresses request/response pairs for `/health/live` and `/health/ready`. Health probes happen frequently and would otherwise dominate log volume.
- `customProps(req)` — copies `req.correlationId` onto every record produced for that request. Reading the field is safe even when `CorrelationMiddleware` has not yet run, because the augmented type marks it optional.
- `transport` — present only when `NODE_ENV === 'development'`. Routes Pino through `pino-pretty` with `singleLine: true`, `colorize: true`, and short timestamps. In production the field is omitted, producing line-delimited JSON.

## 4. Redact list

The list lives in `src/config/constants.ts` because the logger and any module that introduces a new secret need a shared source of truth. Current entries cover:

- Common HTTP headers: `authorization`, `cookie`, `x-api-key`.
- Common payload fields under any object: `password`, `passwordHash`, `token`, `accessToken`, `refreshToken`, `authorization`, `cookie`.

Add a new path whenever a new module introduces a secret-bearing field (e.g., `apiKey`, `signingSecret`, `webhookSecret`). Reuse `*.field` wildcards so the rule applies regardless of nesting depth.

## 5. Correlation propagation

The chain is intentional and ordered:

1. `pino-http` attaches a fresh child logger (with `req.id`) to every request before any Nest layer runs.
2. `CorrelationMiddleware` wraps that logger with `req.log.child({ correlationId })` so subsequent log calls inherit the id.
3. `customProps` reads `req.correlationId` again on each log record — the redundancy is harmless and protects against middleware ordering regressions.

If a future component logs *outside* a request context (e.g., a queue worker), it must build its own child logger from the application Pino instance, with the correlation id passed through the job payload.

## 6. Performance notes

- Pino is async by default. In production the JSON destination is the stdout stream; container log drivers handle persistence.
- `pino-pretty` is only a dev dependency at runtime cost; it should never run in prod (the conditional transport block enforces this).
- The redact engine compiles the path list once on boot; runtime cost per record is minimal even when the list grows.

## 7. Failure modes

- If `LOG_LEVEL` is missing/invalid the env parser rejects boot — the logger module never sees a bad value.
- If `pino-pretty` fails to load in development (uninstalled, etc.), Pino falls back to JSON. Behaviour is degraded but never silent.
- `req.log.error(...)` accepts both `(obj, msg)` and `(msg)` forms. The exception filter uses the structured form to attach `err` and `code` fields.

## 8. Tests

There is no dedicated test for `LoggerModule` itself — Pino is exercised transitively by the e2e health test, which asserts the response side-effects (`x-correlation-id` header). Behaviour-level checks for redaction live in the Pino test suite upstream.

## 9. Future evolution

- A request interceptor that logs a single summary record per request (currently `autoLogging` does this) and tags it with controller + handler name (Phase 10 observability work).
- Metrics emitted via a Prometheus client; logger module will likely register a custom `requestSerializer` to drop bodies we do not want metrically indexed.
- Sampling for very chatty endpoints.

This module is expected to stay small. New behaviour belongs in an observability module rather than here.
