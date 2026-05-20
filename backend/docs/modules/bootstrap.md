# Module — Bootstrap (`main.ts` + `AppModule`)

> The composition root and the process entry point. Owns global wiring that no other module is allowed to do.

**Files**
- `src/main.ts` — process entry, applies global HTTP middleware and filters, starts the listener.
- `src/app.module.ts` — Nest composition root, mounts request-scoped middleware, registers the `TransactionRunner` provider.

---

## 1. Responsibility

- Wire the Nest application from its dependency modules (`ConfigModule`, `LoggerModule`, `DatabaseModule`, `CacheModule`, `HealthModule`, `UsersModule`, `AuthModule`).
- Apply request-level middleware to all routes.
- Configure transport-layer concerns (helmet, cookie-parser, CORS, body parser limits, `/api` global prefix).
- Register the global exception filter.
- Enable graceful shutdown hooks so infrastructure modules (Redis, TypeORM) release resources cleanly.
- Bridge `console.log`-style accidents into structured logs by re-routing Nest's internal logger to Pino.

## 2. `AppModule`

- Decorated with imports in order: `ConfigModule` (must parse first because it is `@Global()` and feeds every other factory), `LoggerModule`, `DatabaseModule` (`@Global`, opens TypeORM during Nest bootstrap), `CacheModule` (`@Global`, opens the ioredis client), `HealthModule` (depends on both for its terminus probes), `UsersModule`, `AuthModule`, `RealtimeModule` (Phase 4 — the Socket.IO gateway, which imports `AuthModule` for `JwtService`). `AuthModule` must come after `UsersModule` because it imports `UserRepository`; `RealtimeModule` must come after `AuthModule` for the same reason.
- Registers `TransactionRunner` (from `@app/infra/db/transactions`) as a provider and re-exports it so any feature module can inject it without importing TypeORM directly.
- Implements `NestModule` and mounts `CorrelationMiddleware` for `'*'` (every route, including future ones). This is the only middleware bound at this layer — anything else belongs in `main.ts` or in a feature module.
- Holds no controllers of its own. It is a composition seam plus the home of one cross-cutting provider.

## 3. `main.ts` — bootstrap sequence

The `bootstrap()` async function performs the following ordered steps. Order is load-bearing; do not reshuffle without understanding the effects.

1. **Create the application** with `NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true })`. `bufferLogs` keeps startup logs queued until the Pino logger is attached. The factory also triggers `DatabaseModule` (TypeORM connect) and `CacheModule` (ioredis connect) initialisation — if either fails the process exits non-zero before HTTP listens.
2. **Switch the logger** via `app.useLogger(app.get(Logger))` so subsequent Nest framework logs (route resolution, lifecycle, exceptions) emit through Pino.
3. **Resolve `APP_CONFIG`** to read the parsed env once. No other process is allowed to read `process.env` directly.
4. **Disable `x-powered-by`** by calling `app.disable('x-powered-by')` on the underlying Express instance.
5. **Conditionally trust the proxy** based on `TRUST_PROXY`. The value `true` sets `trust proxy` to `1` (the first hop), suitable when running behind a single load balancer.
6. **Apply `helmet()`** with its default policy set (CSP, HSTS, X-Content-Type-Options, etc.).
7. **Mount `cookieParser()`** so `req.cookies` is populated before `AuthController.refresh` / `logout` read the refresh cookie. Order matters: this must precede route resolution.
8. **Enable CORS** with `app.enableCors(...)`. If `CORS_ORIGINS` contains a literal `*`, `origin: true` is used; otherwise the string array is passed verbatim. `credentials: true` is always set so the refresh cookie flows on cross-origin requests.
9. **Set body parser limits** for both JSON and urlencoded via `app.useBodyParser(...)`, sourced from `BODY_LIMIT`.
10. **Apply the `/api` global prefix** via `app.setGlobalPrefix('api', { exclude: [{ path: 'health/(.*)', method: RequestMethod.ALL }] })`. Every business controller (`AuthController` and successors) is now served under `/api/...`; the health endpoints intentionally stay at `/health/live` and `/health/ready` so orchestrator probes do not need to learn a prefix.
11. **Install the global exception filter** `new AllExceptionsFilter()`. This is the only place that filter is registered.
12. **Register the Socket.IO Redis adapter** via `app.useWebSocketAdapter(new SocketRedisAdapter(app))` — must happen **before** `listen()` so the adapter is wired in before any WS upgrade is accepted. The adapter pulls the existing ioredis client out of `CacheModule` via DI; no second Redis connection is opened.
13. **Enable shutdown hooks** with `app.enableShutdownHooks()`. This is required so `CacheModule.OnApplicationShutdown` runs (`redis.quit()`) and Nest's TypeORM lifecycle closes the DataSource on SIGTERM. The Socket.IO server shuts down through the same mechanism. Phase 5+ will lean on it again for BullMQ workers.
14. **Start listening** on `PORT`, then emit a single info-level log line with the bound URL.

## 4. Process-level handlers

Two top-level handlers are installed *outside* the `bootstrap()` function:

- `process.on('unhandledRejection', reason => { console.error(...); process.exit(1); })`
- `process.on('uncaughtException', err => { console.error(...); process.exit(1); })`

Both intentionally use `console.error` because the Pino logger may not be available at the time they fire. They exit with code 1 so the orchestrator (Docker, Kubernetes, systemd) restarts the process. This behaviour is required by the architecture document and must not be softened to a warning.

## 5. Why the Zod pipe is not global

The plan deliberately keeps Zod validation per-parameter (`@Body(new ZodValidationPipe(Schema))` or the `@ZodBody` helper) so each handler explicitly declares which schema applies. Registering it globally would tie validation to argument-decorator metadata and obscure the contract.

If a future change wants a global pipe (e.g., for query string defaults), do it in `main.ts` with an explicit comment explaining the reasoning, and make sure it does not double-validate bodies.

## 6. Production vs development behaviour

- `NODE_ENV=development` (default): Pino emits via `pino-pretty` (single-line, coloured, human-readable timestamps).
- `NODE_ENV=production`: plain JSON lines suitable for ingestion by Loki/Datadog/CloudWatch. `PG_SSL=true` is also expected here so TypeORM connects with `ssl: { rejectUnauthorized: true }`, plus `REFRESH_COOKIE_SECURE=true` so the refresh cookie is only ever sent over HTTPS.
- `NODE_ENV=test`: same JSON output. Tests that boot the app via `Test.createTestingModule` must register `AllExceptionsFilter` themselves and, if they pull in `AppModule` directly, must provide working `DATABASE_URL` + `REDIS_URL` + `JWT_PRIVATE_KEY` + `JWT_PUBLIC_KEY` values (either real or via Testcontainers / stub PEMs). The current `test/health.e2e-spec.ts` sidesteps this by composing a minimal test module rather than the full `AppModule`.

## 7. Common editing mistakes

| Mistake | Correct pattern |
| --- | --- |
| Reading `process.env.PORT` somewhere else. | Inject `APP_CONFIG` and read `config.PORT`. |
| Registering global guards/interceptors here before they exist. | Add them in the module that owns them, with an explicit reason in this document. |
| Removing `app.enableShutdownHooks()`. | It must stay — `CacheModule` and the TypeORM connection depend on it for graceful exit. |
| Logging via `console.log`. | Use the injected `Logger` or `req.log`. |
| Forgetting `bufferLogs: true`. | Without it, the first few startup lines emit through Nest's default logger and bypass redaction. |
| Reordering imports so `DatabaseModule` or `CacheModule` precedes `ConfigModule`. | `ConfigModule` must initialise first; the other modules read `APP_CONFIG` via `inject:` in their factories. |
| Calling `dataSource.transaction(...)` directly. | Inject `TransactionRunner` and call `tx.run(async (em) => ...)` so the helper owns BEGIN/COMMIT/ROLLBACK/release. |

## 8. Tests

- `test/health.e2e-spec.ts` boots a minimal Nest application (Config + Logger + Correlation + a liveness controller) and asserts the live probe and the 404 envelope without requiring DB/Redis to be reachable. End-to-end coverage that includes the readiness probe lives next to the first domain module in Phase 3 once a Testcontainers harness is in place.
- There is intentionally no dedicated test for `main.ts` because almost every line is framework configuration. Coverage is excluded for the file in `vitest.config.mts`.

## 9. Future evolution

Phase 3 added `UsersModule` + `AuthModule`, `cookie-parser`, the `/api` prefix, and per-controller `JwtAuthGuard`. Phase 4 added `RealtimeModule` and the Socket.IO Redis adapter (in progress — gateway + handshake wired; contract docs land with phase closure). Still pending:

- `BullModule.forRootAsync` + `BullModule.registerQueue(...)` imports on `AppModule` (Phase 5).
- A custom rate-limit module bound globally (Phase 11).

Each of those will get its own doc page; this file's responsibilities will not shrink.
