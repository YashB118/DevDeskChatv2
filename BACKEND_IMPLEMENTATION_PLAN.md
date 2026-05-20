# Backend Implementation Plan

> Phase-by-phase execution plan for building the DevChatDesk backend to the standard defined in [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md). Each phase is a self-contained unit that can be handed to an AI agent or developer. Phases ship in order; each one leaves the codebase production-quality at that scope.

---

## How to use this plan

Each phase contains:

1. **Overview** — what this phase is and why it exists.
2. **Objectives** — concrete goals.
3. **Features to implement** — the deliverables.
4. **Technical implementation details** — the how.
5. **Folder structure updates** — what gets added.
6. **Required modules / providers / guards / pipes / filters** — the moving pieces.
7. **API / WebSocket / queue flow** — runtime behavior.
8. **State / data flow** — how data moves through the system.
9. **Database considerations** — schema, indexes, migrations.
10. **Validation strategy** — Zod schemas and where they apply.
11. **Error handling** — what can fail and how it surfaces.
12. **Security considerations** — what to harden.
13. **Testing requirements** — unit, integration, contract.
14. **Performance & scalability notes** — budgets and patterns.
15. **Final deliverables** — checklist that gates the phase.
16. **AI implementation prompt** — copy-paste prompt for an agent.

A phase is complete only when every item under "Final deliverables" is checked.

---

## Phase Map

| Phase | Status | Theme |
|---|---|---|
| **1** | ✅ Complete | Foundation: NestJS project, config, logging, error infrastructure |
| **2** | ✅ Complete | Persistence: PostgreSQL (TypeORM via `@nestjs/typeorm`) + Redis + migrations + connection lifecycle |
| **3** | ✅ Complete | Authentication: JWT (`@nestjs/jwt`), refresh rotation, guards, audit |
| **4** | ✅ Complete | Real-time core: Socket.IO via `@nestjs/websockets` + Redis adapter + typed contract |
| **5** | ✅ Complete | Queue infrastructure: BullMQ via `@nestjs/bullmq`, idempotency, retries |
| **6** | ✅ Complete | External integration: WAHA client, resilience, SQLite store |
| **7** | ✅ Complete | Webhook ingestion: receive, normalize, fan out |
| **8** | ✅ Complete | Domain modules: chats, messages, sessions |
| **9** | ⏳ Pending | Collaboration modules: assignments, mute, feedback, users |
| **10** | ⏳ Pending | Observability: logs, metrics, traces, health, audit |
| **11** | ⏳ Pending | Security hardening, rate limiting, abuse protection |
| **12** | ⏳ Pending | Testing, CI/CD, deployment |

---

# Phase 1 — Foundation

### Overview
Stand up the **NestJS 10 + TypeScript** project skeleton, environment parsing, structured logging, centralized error handling, and the base cross-cutting infrastructure (correlation middleware, global exception filter, validation pipe). No business logic. By the end of this phase the server starts, exposes a health endpoint, and returns a normalized JSON error for any unhandled path.

### Objectives
- Strict TypeScript NestJS project, no `any`, no implicit unknown.
- Environment validated through Zod at boot; missing/bad values crash with a clear message.
- `nestjs-pino` logger with correlation IDs woven through every request.
- Global `AllExceptionsFilter` producing a single error envelope.
- Custom `ZodValidationPipe` ready for use in later phases.
- ESLint + Prettier + Husky pre-commit + GitHub Actions CI scaffold.

### Features to implement
- `main.ts` bootstrap (Nest factory, global pipes, global filters, helmet, cors, body parser limits, shutdown hooks).
- `app.module.ts` root composition.
- `config/env.ts` Zod schema + `ConfigModule` (`@Global()`) exposing env via DI token `APP_CONFIG`.
- `config/logger.module.ts` — `nestjs-pino` setup with redact list.
- `common/middleware/correlation.middleware.ts` — generates or reads `X-Correlation-Id`, binds child logger.
- `common/filters/all-exceptions.filter.ts` — converts `AppError`, `ZodError`, `HttpException`, and unknown errors into the standard envelope.
- `common/pipes/zod-validation.pipe.ts` — generic `new ZodValidationPipe(schema)` pipe.
- `common/decorators/{current-user,correlation-id,zod-body}.decorator.ts` placeholders for later use.
- `shared/errors/{app.error,not-found.error,validation.error,conflict.error,external-service.error}.ts`.
- `infra/health/health.module.ts` + `health.controller.ts` with `/health/live` and `/health/ready` (ready returns 200 unconditionally for now).
- Branded ID types in `shared/types/ids.ts`.
- Result type in `shared/utils/result.ts`.

### Technical implementation details
- Node 20 LTS, ESM-friendly NestJS build (`nest-cli.json` + `tsconfig.build.json`), TypeScript 5.x with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`, plus `experimentalDecorators` + `emitDecoratorMetadata` (required by NestJS).
- `nest start --watch` for local dev; `nest build` then `node dist/main.js` for production.
- `nestjs-pino` with `pino-pretty` only in dev. Production logs are line-delimited JSON. The module wires `pino-http` so every request has a child logger reachable via `@InjectPinoLogger(CTX)` or `request.log`.
- Correlation middleware sets `req.correlationId` and attaches it to the pino request logger. Augment `Express.Request` via a `.d.ts`.
- Error envelope: `{ error: { code, message, correlationId, details? } }`. Stack traces never leave the server.
- `main.ts` registers the filter and pipe globally (`app.useGlobalFilters(new AllExceptionsFilter(...))`, `app.useGlobalPipes(...)` is **not** used for the Zod pipe — Zod is applied per-parameter via `@Body(new ZodValidationPipe(Schema))` to keep the schema explicit at the call site).
- `app.enableShutdownHooks()` so `OnApplicationShutdown` providers can close resources cleanly (used in Phase 2 onwards).

### Folder structure updates
```
backend/
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── config/
│   │   ├── env.ts
│   │   ├── config.module.ts
│   │   ├── logger.module.ts
│   │   └── constants.ts
│   ├── common/
│   │   ├── middleware/correlation.middleware.ts
│   │   ├── filters/all-exceptions.filter.ts
│   │   ├── pipes/zod-validation.pipe.ts
│   │   └── decorators/{current-user,correlation-id,zod-body}.decorator.ts
│   ├── shared/
│   │   ├── errors/{app,not-found,validation,conflict,external-service}.error.ts
│   │   ├── types/{ids.ts,express.d.ts}
│   │   └── utils/result.ts
│   └── infra/health/{health.module.ts,health.controller.ts}
├── nest-cli.json
├── tsconfig.json
├── tsconfig.build.json
├── eslint.config.ts
├── .prettierrc
├── package.json
└── .github/workflows/ci.yml
```

### Required modules / providers / guards / pipes / filters
- `ConfigModule` (`@Global`) exposing `APP_CONFIG`.
- `LoggerModule` exporting the pino root logger.
- `HealthModule` exposing `/health/*`.
- `AllExceptionsFilter` registered globally in `main.ts`.
- `ZodValidationPipe` (used per-parameter starting in later phases).
- `CorrelationMiddleware` applied at `AppModule` via `configure(consumer)` for all routes (`*`).

### API flow
```
Request → CorrelationMiddleware → logger child → (later: guards/pipes) → Controller → Service
                                                ↓ throws AppError
                                       AllExceptionsFilter → JSON envelope
```

### Validation strategy
- `env.ts` Zod schema; `safeParse` at boot, log fail summary, `process.exit(1)`.
- `ZodValidationPipe` ready but unused until Phase 3.

### Error handling
- `AppError` carries `code`, `statusCode`, `details?`, `cause?`.
- `AllExceptionsFilter` differentiates: `AppError` → use its values; `ZodError` (defensive — pipe normally throws our own) → 400 `VALIDATION_ERROR`; `HttpException` → pass through with code derived from status; everything else → 500 `INTERNAL_ERROR` with `req.log.error` carrying the cause.
- Unhandled rejection and uncaught exception handlers log and exit 1 (let the orchestrator restart).

### Security considerations
- `helmet()` with sensible defaults wired in `main.ts`.
- CORS allowlist from env via `app.enableCors(...)`.
- `app.use(express.json({ limit: '2mb' }))`.
- Trust proxy if behind LB (configured via env).
- Disable `x-powered-by`.

### Testing requirements
- Vitest configured with `tsconfig` paths and `@nestjs/testing` available.
- Tests:
  - `env.ts` rejects missing required vars.
  - `AllExceptionsFilter` produces correct envelope for `AppError`, `ZodError`, `HttpException`, unknown.
  - `CorrelationMiddleware` reuses incoming header or creates one.
  - Health endpoints return 200 (via Supertest against `INestApplication`).

### Performance & scalability notes
- Single-process for now; cluster / multi-pod added at deployment phase.
- Pino async destinations enabled in production.

### Final deliverables
- [x] `npm run start:dev` boots, logs structured JSON, hits `/health/live`.
- [x] `npm run build && node dist/main.js` works.
- [x] `npm run lint`, `npm run typecheck`, `npm test` all pass.
- [x] CI runs lint + typecheck + tests on every PR.
- [x] Husky pre-commit runs lint-staged.
- [x] README documents how to run.

**Status: ✅ Complete** — implemented in [backend/](backend/). 18 tests pass; prod bundle boots with helmet, CORS, correlation IDs, structured JSON logs, normalized error envelope.

### AI implementation prompt
> Build Phase 1 of the DevChatDesk backend per `BACKEND_IMPLEMENTATION_PLAN.md` and `BACKEND_ARCHITECTURE.md`. Initialize a NestJS 10 + TypeScript (strict, `experimentalDecorators`, `emitDecoratorMetadata`) project under `backend/` using the Express HTTP adapter. Implement Zod-validated env loading at `config/env.ts`, a `@Global()` `ConfigModule` exposing the parsed env via the `APP_CONFIG` injection token, a `nestjs-pino` logger module with redact list (`password`, `token`, `authorization`, `cookie`), a `CorrelationMiddleware` that augments `req` with `correlationId` and binds the pino child logger, an `AppError` base class with `NotFoundError`, `ValidationError`, `ConflictError`, `ExternalServiceError` subclasses, a global `AllExceptionsFilter` emitting `{ error: { code, message, correlationId } }`, and a `ZodValidationPipe` ready for per-parameter use. Register `helmet()`, CORS from env, body-parser limit, `app.enableShutdownHooks()`, and the global filter in `main.ts`. Add `HealthModule` with `/health/live` and `/health/ready` endpoints (ready returns 200 unconditionally for now). Set up ESLint (`strict-type-checked`), Prettier, Husky + lint-staged, and a GitHub Actions workflow that runs lint, typecheck, and tests. Add branded ID types (`UserId`, `ChatId`, `MessageId`, `SessionId`) and a `Result<T,E>` helper. Provide Vitest + `@nestjs/testing` + Supertest tests for env parsing, exception filter behaviors across error types, correlation propagation, and the health endpoints. No business logic — this phase is foundation only.

---

# Phase 2 — Persistence Layer

### Overview
Wire up PostgreSQL (via `@nestjs/typeorm`) and Redis with proper lifecycle management. Connections are managed centrally with retry, graceful shutdown, and ready-probes that reflect real connectivity. The migration runner is installed in this phase so every later phase ships schema as versioned migrations from day one — `synchronize: true` is permanently off.

### Objectives
- Single TypeORM `DataSource` driven by `TypeOrmModule.forRootAsync`, with pool sizing and retry on transient disconnect.
- **Naming strategy that automatically converts camelCase entity properties to snake_case database identifiers** — installed once, never overridden inline. Application code stays 100% camelCase; the database stays 100% snake_case.
- Standalone `infra/db/datasource.ts` export for the TypeORM CLI (so migrations don't need Nest bootstrap).
- TypeORM migration runner installed; CLI scripts wired in `package.json`; `npm run migrate` applies pending migrations.
- `CacheModule` exposes an `ioredis` provider with retry strategy.
- `/health/ready` checks both connections (Postgres `SELECT 1`, Redis `PING`) via `@nestjs/terminus`.
- Transaction helper (`withTransaction(fn)`) using a TypeORM `QueryRunner`.
- Cache service (`CacheService`) with namespaced keys and TTL.
- Distributed lock helper (`DistributedLockService`).

### Features to implement
- `infra/db/database.module.ts` — `TypeOrmModule.forRootAsync({ useFactory: ... })` consuming `APP_CONFIG`.
- `infra/db/datasource.ts` — standalone `DataSource` export used exclusively by the migration CLI.
- `infra/db/naming.ts` — `SnakeNamingStrategy` overriding every relevant hook (`tableName`, `columnName`, `relationName`, `joinColumnName`, `joinTableName`, `joinTableColumnName`, `indexName`, `primaryKeyName`, `foreignKeyName`). Identifier names follow deterministic patterns (`idx_<table>_<col>`, `pk_<table>`, `fk_<table>_<col>`).
- `infra/db/transactions.ts` — `withTransaction(fn, options?)` that acquires a `QueryRunner`, wraps in `BEGIN/COMMIT/ROLLBACK`, passes the scoped `EntityManager` to `fn`.
- `infra/db/migrations/` — initial empty directory plus a `0001_init.ts` placeholder migration that enables `pgcrypto` (for `gen_random_uuid()`).
- `infra/cache/cache.module.ts` (`@Global()`), `infra/cache/redis.provider.ts`, `infra/cache/cache.service.ts`, `infra/cache/distributed-lock.service.ts`.
- `infra/health/health.module.ts` extended with terminus indicators for Postgres + Redis.
- Replace the stub readiness route with the terminus-driven version.
- `OnApplicationShutdown` hooks on the cache and database modules to close connections in reverse order.
- `package.json` scripts: `migrate`, `migrate:revert`, `migrate:generate`, `migrate:create`, `migrate:show`.

### Technical implementation details
- TypeORM `DataSource` options (used identically by `TypeOrmModule.forRootAsync` and the standalone CLI export):
  - `type: 'postgres'`.
  - `synchronize: false` (enforced in all envs).
  - `logging: ['error', 'warn', 'migration']` plus `'query'` when `LOG_LEVEL=debug`.
  - `entities: [<glob to all *.entity.ts>]`, `migrations: ['src/infra/db/migrations/*.ts']`.
  - `namingStrategy: new SnakeNamingStrategy()` — the single, sole, authoritative casing converter.
  - `extra: { max: env.PG_POOL_MAX, idleTimeoutMillis: 30000, statement_timeout: 5000, idle_in_transaction_session_timeout: 30000 }`.
- The Nest-managed DataSource initializes during `TypeOrmModule` bootstrap. On failure, the process exits non-zero with a clear error before HTTP starts accepting.
- **Naming strategy ground rules** (enforced by code review + ESLint):
  - Entity property names are always camelCase (`userId`, `tokenFamilyId`, `createdAt`).
  - `@Column`, `@JoinColumn`, `@JoinTable` do **not** receive a `name:` option except when integrating with a legacy table; deviations require a `// naming-override: <reason>` comment.
  - Indexes, primary keys, and foreign keys are named deterministically by the strategy — no manual `name:` arguments on `@Index`.
  - Raw SQL in migrations uses snake_case identifiers (matches the DB). Raw SQL inside `dataSource.query(...)` uses snake_case identifiers but always with parameter binding.

A reference implementation of the strategy lives in `infra/db/naming.ts`:

```ts
import { DefaultNamingStrategy, NamingStrategyInterface, Table } from 'typeorm';
import { snakeCase } from './case';
import pluralize from 'pluralize';

export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  tableName(targetName: string, userSpecifiedName?: string): string {
    return userSpecifiedName ?? snakeCase(pluralize(targetName));
  }
  columnName(propertyName: string, customName?: string, embeddedPrefixes: string[] = []): string {
    return customName ?? snakeCase([...embeddedPrefixes, propertyName].join('_'));
  }
  relationName(propertyName: string): string {
    return snakeCase(propertyName);
  }
  joinColumnName(relationName: string, referencedColumnName: string): string {
    return `${snakeCase(relationName)}_${snakeCase(referencedColumnName)}`;
  }
  joinTableName(firstTableName: string, _secondTableName: string, firstPropertyName: string): string {
    return snakeCase(`${firstTableName}_${firstPropertyName.replace(/\./g, '_')}`);
  }
  joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return snakeCase(`${tableName}_${columnName ?? propertyName}`);
  }
  indexName(tableOrName: Table | string, columns: string[], where?: string): string {
    const table = typeof tableOrName === 'string' ? tableOrName : tableOrName.name;
    const base = `idx_${table}_${columns.map(snakeCase).join('_')}`;
    return where ? `${base}_partial` : base;
  }
  primaryKeyName(tableOrName: Table | string): string {
    const table = typeof tableOrName === 'string' ? tableOrName : tableOrName.name;
    return `pk_${table}`;
  }
  foreignKeyName(tableOrName: Table | string, columnNames: string[]): string {
    const table = typeof tableOrName === 'string' ? tableOrName : tableOrName.name;
    return `fk_${table}_${columnNames.map(snakeCase).join('_')}`;
  }
}
```

`typeorm-naming-strategies` can substitute for this hand-written version; either is acceptable as long as every hook in the table above is overridden.

- Migration runner: `dataSource.runMigrations()` invoked by `scripts/migrate.ts` (uses the standalone export). CI runs migrations against an ephemeral Postgres container before tests execute.
- `ioredis`: `retryStrategy` exponential capped at 30s; `maxRetriesPerRequest: 3`. Exposed as a `useFactory` provider in `CacheModule` so it can be injected anywhere.
- Distributed lock built on Redis `SET NX PX` plus a Lua release script (cached via `SCRIPT LOAD`); lock TTL parameter required; refresh helper provided.
- `CacheService.wrap(key, ttl, loader)` performs lock-protected stampede prevention and Zod-validates the parsed value on read.

### Folder structure updates
```
backend/src/infra/
├── db/
│   ├── database.module.ts            # TypeOrmModule.forRootAsync
│   ├── datasource.ts                 # Standalone export for the CLI
│   ├── naming.ts
│   ├── transactions.ts
│   ├── subscribers/                  # entity subscribers (audit, updated_at touch)
│   └── migrations/
│       └── 0001_init.ts
├── cache/
│   ├── cache.module.ts
│   ├── redis.provider.ts
│   ├── cache.service.ts
│   └── distributed-lock.service.ts
└── health/
    ├── health.module.ts              # @nestjs/terminus
    └── health.controller.ts

backend/scripts/
├── migrate.ts
└── migrate-revert.ts
```

### State / data flow
```
Service.method()
   ├── cacheService.wrap('chats:user:42', 10s, () => repo.list())
   │        ├── Redis GET → hit → Zod parse → return
   │        └── miss → distributedLock.with('chats:user:42', loader)
   ├── repo.list()
   │        └── repo = AppDataSource.getRepository(Entity) (injected via @InjectRepository in later phases)
   │            └── .find({ where, order, take, relations }) + toDomain mapper
   └── return DTO
```

For transactional writes:
```
withTransaction(async (em) => {
  const userRepo = em.getRepository(User);
  const tokenRepo = em.getRepository(RefreshToken);
  await userRepo.update(...);
  await tokenRepo.insert(...);
});
```

Repositories accept an optional `EntityManager` parameter so they can participate in the caller's transaction. When omitted, they use the default `DataSource` manager.

### Database considerations
- `pgcrypto` extension enabled for `gen_random_uuid()`.
- All UUID PKs default to `gen_random_uuid()`.
- Naming strategy enforces `snake_case` column names and pluralized table names.
- No tables in this phase — only the extension migration.

### Validation strategy
- Cache values passed through a Zod schema on read to detect drift after deploys.
- TypeORM entity column types are not the validation surface — request validation goes through Zod at the route layer (`ZodValidationPipe`).

### Error handling
- DataSource init failure → crash with a clear log line and non-zero exit before HTTP listens.
- Postgres transient disconnect: TypeORM auto-reconnects per pool semantics; `/health/ready` flips while the pool is starved.
- Redis disconnect: same readiness behavior, but `cache.wrap` falls through to the loader (degraded mode — log a warning, keep serving).
- Lock acquisition failure after retry budget → service surfaces a `ConflictError`.
- Migration failure on boot → process exits non-zero; deploy fails fast (this is desired).

### Security considerations
- `DATABASE_URL` only from env. Logger redact list includes the URL.
- Pool size, statement timeout, and idle-in-transaction timeout enforced server-side.
- Lua scripts loaded via `SCRIPT LOAD` so EVALSHA bypasses string interpolation.
- TLS to Postgres in production (`ssl: { rejectUnauthorized: true }`); disabled in local docker-compose only.

### Testing requirements
- Testcontainers Postgres + Redis.
- `migrate.ts` runs against the test container before each integration suite.
- Tests:
  - Connection lifecycle: Nest application closes release sockets cleanly via shutdown hooks.
  - `withTransaction`: rollback on thrown error, commit on success, nested call uses the same `EntityManager`.
  - Cache wrap: cold miss runs loader once across concurrent callers (stampede test).
  - Distributed lock: only one holder at a time; release works; expiry works.
  - Migration runner: applying twice is a no-op; rolling back the last migration reverts the schema change.
  - Naming strategy unit tests: a synthetic entity with `camelCaseProperty`, `@ManyToOne` relation, `@Index(['camelOne', 'camelTwo'])` produces `camel_case_property`, `<relation>_id` join column, `idx_<table>_camel_one_camel_two` index, `pk_<table>`, `fk_<table>_<col>`. Cover every overridden hook.

### Performance & scalability notes
- Pool size: `PG_POOL_MAX = 20` per pod default. With HPA, watch total connections; introduce PgBouncer (transaction pooling) once cluster-wide active connections approach Postgres `max_connections` minus headroom.
- Statement timeout 5s for HTTP-facing queries; queue workers configure their own connection pool with a 30s timeout in a later phase if needed.
- Redis: single client per process; commands pipelined automatically by ioredis.

### Final deliverables
- [x] Nest application only starts accepting traffic after TypeORM + Redis are ready.
- [x] `/health/ready` flips to 503 when either disconnects (via terminus).
- [x] `npm run migrate` applies migrations; `migrate:revert` rolls back; both idempotent on already-applied state.
- [x] `synchronize: false` enforced (hard-coded in `data-source-options.ts`).
- [x] Naming strategy registered exactly once; unit tests confirm camelCase → snake_case across all overridden hooks.
- [x] ESLint rule flagging `name:` inside `@Column`/`@JoinColumn`/`@JoinTable` is active.
- [x] `withTransaction` unit tests pass (commit + rollback + isolation level semantics).
- [x] Cache service + distributed lock unit tests pass.
- [x] Graceful shutdown drains in <30s and exits 0 (`CacheModule.OnApplicationShutdown` + Nest DataSource lifecycle on `app.enableShutdownHooks()`).

**Status: ✅ Complete** — implemented in [backend/](backend/). 54 tests pass; lint + typecheck + build green.
Testcontainers-backed integration tests for live DB + Redis end-to-end behavior land alongside the first domain module in Phase 3 once there is real schema to exercise.

### AI implementation prompt
> Build Phase 2 of the DevChatDesk backend. Set up PostgreSQL via `@nestjs/typeorm` and Redis under `src/infra/`. Implement `infra/db/database.module.ts` using `TypeOrmModule.forRootAsync({ useFactory })` with `type: 'postgres'`, `synchronize: false` (permanently off in every environment), `entities: ['src/**/*.entity.ts']`, `migrations: ['src/infra/db/migrations/*.ts']`, and `extra: { max: env.PG_POOL_MAX, statement_timeout: 5000, idle_in_transaction_session_timeout: 30000 }`. Also export a standalone `DataSource` from `infra/db/datasource.ts` for the TypeORM CLI. Implement `infra/db/naming.ts` exporting a `SnakeNamingStrategy` extending TypeORM's `DefaultNamingStrategy`, overriding `tableName` (snake_case + pluralize), `columnName` (snake_case including embedded prefixes), `relationName`, `joinColumnName` (`<relation>_<refColumn>`), `joinTableName`, `joinTableColumnName`, `indexName` (`idx_<table>_<col1>_<col2>[_partial]`), `primaryKeyName` (`pk_<table>`), and `foreignKeyName` (`fk_<table>_<col>`). Register the strategy in the DataSource options — this is the ONLY place naming conversion happens. The codebase uses camelCase for every entity property, repository method, and DTO field; the database uses snake_case for every table, column, FK, and index. No entity should carry `@Column({ name: '...' })`, `@JoinColumn({ name: '...' })`, or `@JoinTable({ name: '...' })` overrides; if a legacy table requires it, add an `// naming-override: <reason>` comment above the decorator. Add an ESLint rule (`no-restricted-syntax` on these AST shapes) that flags such overrides when the comment is missing. Add a single initial migration `0001_init.ts` that enables the `pgcrypto` extension. Wire `scripts/migrate.ts` and `migrate-revert.ts` (both consume the standalone DataSource) plus `package.json` scripts (`migrate`, `migrate:revert`, `migrate:generate`, `migrate:create`, `migrate:show`). Implement `infra/db/transactions.ts` exporting `withTransaction(fn, options?)` that acquires a `QueryRunner`, wraps in BEGIN/COMMIT/ROLLBACK, and passes the scoped `EntityManager` into `fn`. Add a `@Global()` `CacheModule` exposing an `ioredis` provider (`infra/cache/redis.provider.ts`) with exponential retry capped at 30s, a `CacheService` (`get/set/del/wrap`) where `wrap` Zod-validates parsed values and is stampede-protected by a Redis `SET NX PX` + Lua-release `DistributedLockService`. Extend `HealthModule` with `@nestjs/terminus` indicators that run a real `SELECT 1` and Redis `PING`. Wire `OnApplicationShutdown` providers so connections close in reverse order on `SIGTERM` (via `app.enableShutdownHooks()`). Provide Testcontainers-based integration tests for: TypeORM init + shutdown via the Nest lifecycle, `withTransaction` commit + rollback, cache stampede prevention, distributed lock semantics, migration apply/revert idempotency, and a synthetic-entity naming-strategy test that asserts every overridden hook produces the expected snake_case identifier. Do NOT introduce any domain entities in this phase.

---

# Phase 3 — Authentication

### Overview
Build the authentication module: login, refresh-token rotation, logout, password change, JWT guard, admin guard. Refresh tokens are opaque, hashed, family-tracked for replay detection. Powered by `@nestjs/jwt`.

### Objectives
- RS256 JWT access tokens, 15-minute TTL, signed/verified via `@nestjs/jwt`.
- Opaque refresh tokens stored hashed; rotated on every use; family invalidation on theft detection.
- `JwtAuthGuard`, `AdminGuard`.
- `@CurrentUser()`, `@Roles()` decorators.
- Bcrypt password hashing (cost 12).
- Seed script for an initial admin.
- Audit log entries on login, password change, logout.

### Features to implement
- `modules/users/` minimum: `User` entity, `UserRepository`, exported from `UsersModule`. No admin CRUD endpoints yet — those come in Phase 9.
- `modules/auth/` module: `AuthModule`, `AuthController`, `AuthService`, `AuthRepository` (refresh token store), entities (`User` re-exported, `RefreshToken`, `AuditLog`), Zod schemas, types.
- `common/guards/jwt-auth.guard.ts`, `common/guards/admin.guard.ts`.
- `common/decorators/{current-user,roles,public}.decorator.ts`.
- `scripts/seed.ts`.
- TypeORM migration `0002_auth.ts` creating `users`, `refresh_tokens`, `audit_log` (partitioned), the `user_role` enum, and enabling `citext`.

### Technical implementation details
- `JwtModule.registerAsync()` configures RS256 signing with `JWT_PRIVATE_KEY` and verification with `JWT_PUBLIC_KEY` from `APP_CONFIG`.
- Refresh token = `randomBytes(48).toString('base64url')`; stored as `bcrypt(token)` keyed by `{ userId, tokenFamilyId }`.
- On refresh: look up by `tokenFamilyId`, bcrypt-compare, then in a single `withTransaction` mark old row `revoked = true` and `replaced_by = newId`, insert new row, return new pair.
- On detected reuse: invalidate the entire family for that user (forces re-login on all devices).
- Cookie flags: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/auth`.
- `JwtAuthGuard` reads the bearer token, verifies via `JwtService.verifyAsync`, populates `req.user`. A `@Public()` decorator opts specific routes out of a globally-applied guard if you choose to register it globally (recommended: apply per controller via `@UseGuards(JwtAuthGuard)` to keep things explicit).
- `AdminGuard` runs after `JwtAuthGuard` and rejects non-admin users.

### Folder structure updates
```
backend/src/modules/
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── auth.repository.ts        # refresh token store
│   ├── refresh-token.entity.ts
│   ├── audit-log.entity.ts
│   ├── auth.schema.ts            # LoginSchema, RefreshSchema, PasswordChangeSchema
│   ├── auth.types.ts
│   └── auth.spec.ts
└── users/
    ├── users.module.ts
    ├── user.entity.ts
    ├── user.repository.ts
    └── user.types.ts

backend/src/common/
├── guards/{jwt-auth.guard.ts, admin.guard.ts}
└── decorators/{current-user.decorator.ts, roles.decorator.ts, public.decorator.ts}
```

### API flow
- `POST /api/auth/login` → validate via `ZodValidationPipe(LoginSchema)` → bcrypt compare → issue access (body) + refresh (cookie) → audit.
- `POST /api/auth/refresh` → read cookie → rotate inside `withTransaction` → set new cookie → return new access.
- `POST /api/auth/logout` → invalidate family → clear cookie.
- `PATCH /api/auth/password` → guarded by `JwtAuthGuard` → verify current → write new bcrypt hash → invalidate all refresh families → audit.

### Database considerations
- `users(id uuid PK default gen_random_uuid(), email citext UNIQUE NOT NULL, password_hash text NOT NULL, role user_role NOT NULL, display_name text NOT NULL, disabled boolean NOT NULL DEFAULT false, created_at, updated_at)`. `user_role` enum: `ADMIN | DEVELOPER`. Index: `(disabled) WHERE disabled = false` partial.
- `refresh_tokens(id uuid PK, user_id uuid FK→users ON DELETE CASCADE, family_id uuid NOT NULL, token_hash text NOT NULL, issued_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, replaced_by uuid NULL FK→refresh_tokens, revoked boolean NOT NULL DEFAULT false)`. Indexes: `(family_id)`, `(user_id, revoked)`, `(expires_at) WHERE revoked = false`.
- `audit_log(id uuid PK, user_id uuid NULL FK→users, event text NOT NULL, payload jsonb, created_at timestamptz NOT NULL DEFAULT now())`. Range-partitioned monthly by `created_at`. Indexes: `(user_id, created_at DESC)`, `(event, created_at DESC)`. A monthly job creates the next partition; covered by a small helper migration template generated in this phase.
- `citext` and `pgcrypto` extensions enabled via the migration.

### State / data flow
- Login: `UserRepository.findByEmail(email)` → `bcrypt.compare` → issue access + refresh, INSERT `refresh_tokens`, INSERT `audit_log`.
- Refresh: SELECT by `family_id`, compare hash, in a single `withTransaction`: mark old row `revoked = true` and `replaced_by = newId`, INSERT new row.
- Reuse detection: refresh hits a row already `revoked = true` → revoke entire `family_id` and audit `auth.refresh_reuse`.

### Validation strategy
- `LoginSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(128) })`.
- Email normalized lowercase before lookup.

### Error handling
- Login failure intentionally returns identical error for "user not found" and "wrong password" (`INVALID_CREDENTIALS`).
- Refresh failure → 401 `INVALID_REFRESH_TOKEN` and clear cookie.
- Disabled user → 403 `USER_DISABLED`.

### Security considerations
- Bcrypt cost 12. Slow login on purpose.
- Refresh reuse detection invalidates the family.
- Login attempts rate-limited (foreshadowing Phase 11; stub it now).
- Audit log entries are append-only — no update or delete handlers exist.

### Testing requirements
- Unit: token rotation, family invalidation, password change effects (build with `Test.createTestingModule({...}).overrideProvider(...)`).
- Integration: full login → access protected → refresh → logout flow via Supertest against the real Nest app.
- Reuse test: replay an old refresh token → entire family revoked.

### Final deliverables
- [x] Seed creates `admin@test.com / password123` and the admin can log in.
- [x] `JwtAuthGuard` rejects missing/invalid/expired tokens with correct codes.
- [x] Refresh rotation works; reuse detection invalidates the family.
- [x] Audit log entries written on login, password change, logout.

**Status: ✅ Complete** — implemented in [backend/](backend/). 85 tests pass; lint + typecheck + build green. Live Postgres integration tests for the full login→refresh→logout flow are deferred to Phase 12 alongside the rest of the Testcontainers e2e suite.

### AI implementation prompt
> Build Phase 3 of the DevChatDesk backend: authentication. Author TypeORM entities `User` (`users` table, `citext` email unique, `user_role` enum) inside `UsersModule`; `RefreshToken` (`refresh_tokens`, FK to users with ON DELETE CASCADE, `family_id`, `token_hash`, `replaced_by` self-FK, `revoked` boolean) and `AuditLog` (`audit_log`, monthly range partitions by `created_at`, `payload jsonb`) inside `AuthModule`. Generate migration `0002_auth.ts` enabling `citext`, creating these tables and indexes (including the partial index `(expires_at) WHERE revoked = false`), creating the first three months of `audit_log` partitions, and adding a documented helper for future partitions. Implement an `AuthModule` (`@Module`) with login, refresh, logout, and password change endpoints in `AuthController`. Use `@nestjs/jwt` configured via `JwtModule.registerAsync` consuming `APP_CONFIG` (RS256, 15min TTL); refresh tokens are opaque, stored as bcrypt hashes under a `family_id`, rotated on every refresh via `withTransaction`, with replay detection that revokes the entire family on reuse. Cookies: `HttpOnly, Secure, SameSite=Strict, Path=/api/auth`. Add `JwtAuthGuard` and `AdminGuard` in `common/guards/` that augment `req.user`, and `@CurrentUser()`, `@Roles()`, `@Public()` decorators. Repositories return domain DTOs via `toDomain(entity)` mappers — no TypeORM entity escapes the repository boundary. Implement append-only writes to `audit_log` from `AuthService` on login, password change, logout, and refresh-reuse detection. Add `scripts/seed.ts` that idempotently upserts an initial admin. Use bcrypt cost 12. Provide Vitest + `@nestjs/testing` unit tests for rotation/reuse logic and Testcontainers + Supertest integration tests for the full login → refresh → logout flow. Controllers must stay under 15 lines per handler.

---

# Phase 4 — Real-time Core

### Overview
Stand up Socket.IO via `@nestjs/websockets` with the Redis adapter, JWT handshake auth, room conventions, and the typed emitter. No domain events yet — just the transport with one trivial `ping/pong` event for verification.

### Objectives
- Single `RealtimeGateway` registered by `RealtimeModule`.
- Custom `IoAdapter` wires `socket.io-redis-adapter` for horizontal fan-out.
- `WsAuthGuard` runs on connection; failed sockets disconnected.
- Auto-join `user:<userId>` (all) and `admin` (admins).
- Per-chat join via client-emitted `chats:join`.
- Typed `SocketEmitter` provider.
- Sequence counter primitive in Redis for missed-event resume.

### Features to implement
- `realtime/realtime.module.ts`, `realtime/realtime.gateway.ts`, `realtime/ws-jwt.guard.ts`, `realtime/socket-redis.adapter.ts`, `realtime/socket.rooms.ts`, `realtime/socket.emitter.ts`.
- `realtime/events.contract.ts` with Zod schemas (just `ping` / `pong` for this phase; expanded in later phases).
- `realtime/sequence.ts` — Redis monotonic counter per event stream.

### Technical implementation details
- Transports: `['websocket']` only (no long-polling fallback in production).
- Gateway: `@WebSocketGateway({ cors: { origin: env.FRONTEND_URL }, transports: ['websocket'] })` with `OnGatewayConnection`/`OnGatewayDisconnect`.
- `WsAuthGuard` (`CanActivate`) extracts the token from `client.handshake.auth.token`, verifies via `JwtService`, populates `client.data.user`.
- Custom `IoAdapter` (`extends IoAdapter`) constructs the server with `createAdapter(pubClient, subClient)` from `@socket.io/redis-adapter`. Registered in `main.ts` via `app.useWebSocketAdapter(new SocketRedisAdapter(app))` AFTER Redis is ready.
- Rooms: `roomFor.user(id)`, `roomFor.chat(id)`, `roomFor.admin()` — central naming.
- `SocketEmitter` injected with `@Inject(IO_SERVER)` (the Socket.IO `Server` exposed by the gateway via a custom provider) so other modules can emit without depending on the gateway directly. Validates payloads against the contract Zod schema in non-production.

### Folder structure updates
```
backend/src/realtime/
├── realtime.module.ts
├── realtime.gateway.ts
├── ws-jwt.guard.ts
├── socket-redis.adapter.ts
├── socket.rooms.ts
├── socket.emitter.ts
├── events.contract.ts
└── sequence.ts
```

### WebSocket flow
```
Client connects with { auth: { token } }
   ↓
WsAuthGuard verifies JWT
   ↓
on success: client.data.user = payload
            client.join(roomFor.user(user.id))
            if admin: client.join(roomFor.admin())
   ↓
Client emits 'chats:join' with [chatId, ...]
   ↓
Gateway validates assignment access (stubbed for now → allow all in dev)
   ↓
client.join(roomFor.chat(chatId)) for each authorized chat
```

### Validation strategy
- All inbound client events validated through `ZodValidationPipe(Schema)` applied at `@MessageBody`.
- `SocketEmitter` validates outbound payloads in non-production builds.

### Error handling
- Auth failure → `client.disconnect(true)` immediately with reason `unauthorized`.
- Invalid event payload → `client.emit('error:invalid_payload', { event, details })` and drop.

### Security considerations
- CORS configured on the gateway.
- Maximum payload size enforced (`maxHttpBufferSize: 1e6`).
- Per-socket emit budget (foreshadowing rate limiting in Phase 11).

### Testing requirements
- `socket.io-client` integration test against a Nest test app: handshake with valid/invalid token.
- Auto-join: admin joins admin room; user joins their user room.
- Multi-pod test (optional via Testcontainers): event emitted on pod A reaches client on pod B through the Redis adapter.

### Performance & scalability notes
- Redis adapter publishes to a single channel — fine for moderate scale. Sharded adapter is a Phase 12 consideration.
- Connection backpressure: server enforces `pingTimeout: 30s`, `pingInterval: 25s`.

### Final deliverables
- [x] `RealtimeGateway` initialized and listens.
- [x] Custom `IoAdapter` registered after Redis is ready; Redis fan-out active.
- [x] Auth handshake enforces JWT.
- [x] Typed `SocketEmitter` compiles event names ↔ payloads.
- [x] Sequence counter increments and reads correctly across pods.

**Status: ✅ Complete** — implemented in [backend/src/realtime/](backend/src/realtime/). 112 tests pass; lint + typecheck + build green. Cross-pod Redis adapter fan-out is wired in `main.ts` via `SocketRedisAdapter`; a multi-pod Testcontainers smoke test lands with the rest of the live-infra e2e suite in Phase 12.

### AI implementation prompt
> Build Phase 4 of the DevChatDesk backend: real-time core. Build `RealtimeModule` with a `RealtimeGateway` (`@WebSocketGateway({ transports: ['websocket'], cors: { origin: env.FRONTEND_URL } })`) wired to a custom `SocketRedisAdapter` (extending `IoAdapter`) that uses `@socket.io/redis-adapter` over the existing ioredis client. Register the adapter from `main.ts` after Redis is ready via `app.useWebSocketAdapter(...)`. Implement a `WsAuthGuard` (`CanActivate`) that verifies access tokens from `client.handshake.auth.token` using `@nestjs/jwt` and disconnects failures immediately; populate `client.data.user`. Auto-join `user:<userId>` on every connection and `admin` for admin users; expose `roomFor` builders so room naming is centralized. Expose the underlying Socket.IO `Server` from the gateway as a provider (`IO_SERVER` token) and build a `SocketEmitter` injectable that maps event names to payload types via a Zod-backed `events.contract.ts`, with payload validation enabled outside production. Implement a Redis-backed monotonic sequence counter for future missed-event resume. Add a `ping/pong` `@SubscribeMessage` end-to-end as a smoke test using `ZodValidationPipe(PingSchema)` on `@MessageBody`. Provide integration tests using `socket.io-client` against a Nest test app covering handshake auth, auto-join behavior, and (optionally) cross-pod fanout with two Testcontainers Redis-connected processes. No domain events yet.

---

# Phase 5 — Queue Infrastructure

### Overview
Set up BullMQ via `@nestjs/bullmq` with a typed job contract, idempotency by job ID, retries with exponential backoff, and a shared worker harness pattern. Add one no-op queue (`example`) to validate the pipeline end-to-end.

### Objectives
- `QueueModule` registers all queues via `BullModule.registerQueue(...)` and `BullModule.forRootAsync(...)` consuming the existing ioredis connection.
- Worker harness mixin/decorator wraps every `@Processor` handler with logging, metrics, and error normalization.
- Idempotency via `jobId`.
- Graceful worker shutdown on `SIGTERM` via Nest lifecycle hooks.

### Features to implement
- `queues/queue.module.ts`.
- `queues/worker.harness.ts` — common pre/post wrapper invoked from each `@Processor`.
- `queues/example.queue.ts` + `queues/example.processor.ts` (deleted later; verifies the pipeline).

### Technical implementation details
- `BullModule.forRootAsync` configures the connection from `APP_CONFIG`. `BullModule.registerQueue({ name: 'webhook:waha', defaultJobOptions: {...} })` per queue.
- BullMQ uses ioredis. Use `connection: redis.duplicate()` per queue/worker to keep blocking commands isolated.
- Default `attempts: 5`, `backoff: { type: 'exponential', delay: 1000 }`.
- Each `@Processor` extends `WorkerHost`, calls the harness, which forks a child logger with `correlationId` from the job payload, runs Zod parsing on `job.data.payload`, emits a Prometheus histogram, and surfaces failures as proper errors so BullMQ retries.

### Folder structure updates
```
backend/src/queues/
├── queue.module.ts
├── worker.harness.ts
├── job.types.ts
└── example.{queue,processor}.ts
```

### State / data flow
```
producer.add(name, payload, { jobId: hash(uniqueKey) })
   → Redis (stream)
   → processor.process(job) → harness wraps:
        - parse payload with Zod
        - log job.start
        - run handler
        - log job.success | job.fail
        - metrics: queue_job_duration_seconds
```

### Validation strategy
- Every queue defines a Zod payload schema; the harness parses before dispatch.

### Error handling
- Handler throws → BullMQ retries per backoff policy.
- After max retries → move to failed; the `failed` event triggers a structured `error` log with full payload.

### Security considerations
- Queue payloads may carry user identifiers but never raw secrets. The schema enforces this.

### Testing requirements
- Integration: enqueue → processor runs → assert side-effect via a `@nestjs/testing` test module that boots the BullMQ stack against Testcontainers Redis.
- Idempotency: enqueueing the same `jobId` twice runs once.

### Final deliverables
- [x] Example queue + processor round-trips a payload.
- [x] Worker shutdown drains active jobs before exit (via Nest lifecycle).
- [x] Metrics emit per job.

**Status: ✅ Complete** — implemented in [backend/src/queues/](backend/src/queues/). 126 tests pass; lint + typecheck + build green. `WorkerHarness` Zod-validates payloads, attaches correlationId/queue/jobId/attempt structured fields, and emits `durationMs` on every success/failure log line (the Prom-client histogram lands in Phase 10). BullMQ owns a dedicated ioredis connection (`maxRetriesPerRequest: null`) parsed from `REDIS_URL`; Nest lifecycle (`app.enableShutdownHooks()`) drains workers on SIGTERM. Testcontainers-backed enqueue→process round-trip lands with the rest of the live-infra e2e suite in Phase 12.

### AI implementation prompt
> Build Phase 5 of the DevChatDesk backend: BullMQ infrastructure. Create `QueueModule` using `@nestjs/bullmq`: `BullModule.forRootAsync` consumes `APP_CONFIG` for the Redis connection, and one `BullModule.registerQueue({ name: 'example', defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 1000 } } })` for now. Build a `worker.harness.ts` invoked from each `@Processor` (which extends `WorkerHost`) that: parses `job.data.payload` with a per-queue Zod schema, attaches a correlation-id-bound child logger, emits success/failure logs and a Prometheus histogram for job duration. Implement an `example` queue producer (`@InjectQueue('example')`) and processor (`@Processor('example')`) to validate the pipeline end-to-end with an idempotency check via `jobId`. Make sure worker shutdown runs cleanly through `app.enableShutdownHooks()` so jobs aren't lost on SIGTERM. Provide integration tests covering retry on failure and idempotent enqueue against a Testcontainers Redis. Do not introduce domain-specific queues in this phase.

---

# Phase 6 — External Integration: WAHA + SQLite Store

### Overview
Build the resilience-wrapped client for WAHA and the read-only SQLite store reader. These are the only NestJS modules allowed to talk to WAHA or the NOWEB SQLite database.

### Objectives
- `integrations/waha/waha.client.ts` — pure HTTP client, no caching, provided by `WahaModule`.
- `integrations/waha/waha.service.ts` — adds in-memory caching (10s chats, 10s sessions, 5s status), retries on idempotent calls, per-method circuit breaker, request timeouts.
- `integrations/waha-store/waha-store.service.ts` — `getMessageRowids`, `phoneToLid`, `lidToPhone`, all with 60s in-memory caches.

### Features to implement
- `WahaModule` exporting `WahaService`.
- `WahaStoreModule` exporting `WahaStoreService`.
- Typed WAHA API surface (subset used by the app).
- Circuit breaker (`opossum` or a small custom implementation), provided as an injectable per method.
- SQLite reader using `better-sqlite3` opened read-only.

### Technical implementation details
- Default timeout 5s; 30s for media uploads.
- Retry only on idempotent GETs after network/5xx errors.
- Circuit breaker per method; on open → throw `ExternalServiceError(WAHA_UNAVAILABLE)`.
- SQLite path discovered from env; the reader keeps a per-session DB handle, opens lazily, never writes.
- Both modules expose `OnApplicationShutdown` hooks to close clients cleanly.

### Folder structure updates
```
backend/src/integrations/
├── waha/
│   ├── waha.module.ts
│   ├── waha.client.ts
│   ├── waha.service.ts
│   └── waha.types.ts
└── waha-store/
    ├── waha-store.module.ts
    ├── waha-store.service.ts
    └── waha-store.types.ts
```

### Error handling
- Convert provider errors to `ExternalServiceError` with `cause` preserved.
- Circuit breaker logs state transitions (closed → open → half-open → closed).

### Security considerations
- WAHA API key only from env, redacted in logs.
- SQLite file mounted read-only at the OS level; verified at boot via an `OnApplicationBootstrap` hook.

### Testing requirements
- Unit: retry policy, circuit breaker state machine (DI-overridable in `@nestjs/testing`).
- Integration: stubbed WAHA server via `msw` or a local Express stub.
- SQLite: tests run against a small generated fixture DB.

### Final deliverables
- [x] All outbound WAHA calls flow through `WahaService` (other modules import `WahaModule` and inject the service).
- [x] Circuit breaker observable via metrics.
- [x] Phone↔LID lookup correct and cached.

**Status: ✅ Complete** — implemented in [backend/src/integrations/](backend/src/integrations/). 154 tests pass; lint + typecheck + build green. `WahaClient` is a pure typed axios wrapper that converts every upstream failure into `ExternalServiceError` with status details. `WahaService` adds per-method `CircuitBreaker` (configurable threshold/cooldown, observable via `circuitStatus()`), exponential retry on idempotent GETs only (5xx + network), and `TtlCache` for sessions/status/chats with stampede-safe single-flight loaders. `WahaStoreService` opens NOWEB SQLite with `readonly: true + fileMustExist: true`, caches `getMessageRowids` / `phoneToLid` / `lidToPhone` for 60s, verifies the mount is read-only at boot (`WAHA_STORE_REQUIRE_READONLY`), and closes handles cleanly on `OnApplicationShutdown`. Prom-client instrumentation of the circuit lands in Phase 10; live WAHA smoke (MSW + real WAHA) deferred to Phase 12.

### AI implementation prompt
> Build Phase 6 of the DevChatDesk backend: external integrations. Implement `integrations/waha/waha.client.ts` as a pure typed Axios wrapper for the WAHA HTTP API (session/chat/message methods used by `BACKEND_FEATURES_OVERVIEW.md`). Wrap it in `integrations/waha/waha.service.ts` (NestJS `@Injectable` provider) with: 10s in-memory caches for sessions and chats, 5s for status, exponential retry on idempotent GETs, per-method circuit breaker (opening after 5 consecutive 5xx with a 30s cooldown), and request timeouts (5s default, 30s for uploads). Convert all upstream errors to `ExternalServiceError`. Export `WahaService` from `WahaModule`. Implement `integrations/waha-store/waha-store.service.ts` using `better-sqlite3` opened read-only with `getMessageRowids`, `phoneToLid`, `lidToPhone`, each with a 60s in-memory TTL cache; export from `WahaStoreModule`. Verify the SQLite mount is read-only at boot with an `OnApplicationBootstrap` hook. Provide `@nestjs/testing`-based unit tests for retry/circuit logic and integration tests against a fixture SQLite DB and an MSW-stubbed WAHA server.

---

# Phase 7 — Webhook Ingestion

### Overview
Single endpoint receives WAHA webhooks, returns 200 immediately, enqueues to BullMQ. A dedicated `WebhookProcessor` normalizes phone → LID and routes each event to the right downstream handler. Domain handlers are stubs in this phase; they are filled in by later phases.

### Objectives
- `POST /api/webhooks/waha` — Zod-validated, immediately enqueued.
- `WebhookProcessor` normalizes, dispatches, idempotent per WAHA event ID.
- Event routing table maps event types to handler functions/services.
- Pending message reconciliation primitive (Redis TTL) ready for Phase 8.

### Features to implement
- `modules/webhooks/webhooks.module.ts`, `webhooks.controller.ts`, `webhooks.service.ts`.
- `BullModule.registerQueue({ name: 'webhook:waha', ... })` added to `QueueModule`.
- `queues/webhook.processor.ts` (`@Processor('webhook:waha')` extending `WorkerHost`).
- `modules/webhooks/dispatch.ts` — event-type → handler map (handlers are interface stubs the domain modules will implement).
- `modules/messages/pending.store.ts` — Redis key with 9-second TTL.

### API / queue flow
```
WAHA → POST /api/webhooks/waha
   → WebhooksController validates body via ZodValidationPipe(WebhookEnvelopeSchema)
   → (optionally) validates HMAC signature
   → enqueues { jobId: event.id, correlationId, payload }
   → responds 200

WebhookProcessor:
   - phoneToLid normalization on JIDs (via WahaStoreService injected from WahaStoreModule)
   - look up handler in dispatch table
   - handler.run(normalizedEvent)
   - emit downstream socket events (stubbed for now)
```

### Error handling
- Unknown event types → log + ack (do not retry forever).
- Handler throws → BullMQ retries.

### Security considerations
- If WAHA supports webhook signing, verify HMAC before enqueueing.
- The webhook endpoint is `@Public()` (no JWT) but sits on a dedicated rate-limit class to absorb bursts.

### Testing requirements
- Replay an event twice → handler runs once (idempotency by `jobId`).
- Phone-format JIDs get normalized to LID before dispatch.

### Final deliverables
- [x] Webhook acks in <50ms p95.
- [x] Each supported event type routes to a (possibly stub) handler.
- [x] Pending-message store exposes `add(id, ttl)`, `resolve(id)`, `isPending(id)`.

**Status: ✅ Complete** — implemented in [backend/src/modules/webhooks/](backend/src/modules/webhooks/), [backend/src/queues/webhook.processor.ts](backend/src/queues/webhook.processor.ts), and [backend/src/modules/messages/pending.store.ts](backend/src/modules/messages/pending.store.ts). 177 tests pass; lint + typecheck + build green. `POST /api/webhooks/waha` is `@Public()`, Zod-validates the envelope, optionally HMAC-verifies via timing-safe SHA-256 over raw bytes captured by a custom body-parser `verify` hook, and enqueues with `jobId = event.id` for queue-level dedupe. `WebhookProcessor` walks the payload, normalizes phone-format JIDs to LID via `WahaStoreService.phoneToLid`, then dispatches through `WebhookDispatch` whose handlers are Symbol-keyed stubs that Phase 8 will rebind to real domain services. `PendingMessageStore` writes Redis `SET ... PX <ttl>` keys and exposes `add`/`isPending`/`resolve` for the Phase-8 send→webhook reconciliation flow. Webhook rate limiting + live BullMQ round-trip e2e land in Phase 11/12.

### AI implementation prompt
> Build Phase 7 of the DevChatDesk backend: WAHA webhook ingestion. Implement `WebhooksModule` containing `WebhooksController` (`POST /api/webhooks/waha`) that Zod-validates the body via `ZodValidationPipe(WebhookEnvelopeSchema)`, (optionally) verifies an HMAC signature, immediately enqueues a BullMQ job with `jobId = event.id` for idempotency via `@InjectQueue('webhook:waha')`, and returns 200 within milliseconds. The route is `@Public()` — not behind `JwtAuthGuard`. Register `'webhook:waha'` in `QueueModule`. Create `queues/webhook.processor.ts` (`@Processor('webhook:waha')` extending `WorkerHost`) that normalizes phone-format JIDs to LID via `WahaStoreService.phoneToLid` (`WahaStoreModule` imported into `QueueModule`), then dispatches to handler services via a typed dispatch table keyed by event type (`message`, `message.any`, `message.ack`, `message.edited`, `message.reaction`, `session.status`, `group.v2.participants`). Implement the handlers as stub providers that log and return success — they are filled in by later phases. Add a Redis-backed `PendingMessageStore` (`@Injectable`) with 9-second TTL exposing `add`, `resolve`, `isPending`. Provide integration tests for: phone→LID normalization, idempotent re-delivery, retry on handler failure, and the stub dispatch.

---

# Phase 8 — Domain Modules: Chats, Messages, Sessions

### Overview
Implement the three core domain modules. Each is a NestJS module with controller, service, repository, and entities. The webhook handler stubs from Phase 7 are now filled in. Real socket events emit from here onward.

### Objectives
- **Chats**: list with visibility filter (admin vs developer), dedupe NOWEB dual IDs, enrich, cursor pagination, 10s Redis cache; mark-read; participants; sync.
- **Messages**: cursor pagination with parallel JID merge sorted by SQLite rowid; send text/media; edit; delete; react; forward; reconciliation against pending store.
- **Sessions**: list/create/start/stop/delete; QR fetch; status caching with webhook-driven invalidation.
- All mutations emit typed socket events to the correct rooms via `SocketEmitter`.

### Features to implement
- `modules/chats/*`, `modules/messages/*`, `modules/sessions/*` — each its own `@Module`.
- TypeORM entities: `Message`, `MessageReaction`, `MessageQuote`, `DeletedMessage`, `MessageMention`, `MessageEdit`, `Session`. (`Chat` is a virtual concept — chats live in WAHA; an optional `chat_metadata` table is created here to store per-chat overrides like display name caches.)
- Migration `0003_messaging.ts` creating all tables, indexes, and the monthly partitioning scheme for `messages`.
- Webhook stub handlers from Phase 7 wired to these services (each domain module imports `WebhooksModule` if it owns handlers; alternatively, dispatch is wired in `WebhooksModule` and each domain service is injected there — pick one, document it).
- Expanded `events.contract.ts` with `message:new`, `message:ack`, `message:edited`, `message:deleted`, `message:reaction`, `session:status`, `group:participants`.

### API flow (representative)
```
POST /api/messages/:chatId/send  (guarded by JwtAuthGuard)
   → ZodValidationPipe(SendMessageSchema)
   → MessagesService.send(user, chatId, input)
        → policy.canSendToChat(user, chatId)
        → wahaService.sendText(session, chatId, text, quotedId)
        → repo.createOutboundShadow({...})
        → pendingStore.add(stanzaId, 9s)
        → return DTO
   → controller maps to response { messageId }

Webhook 'message.any' arrives with same stanzaId
   → WebhookProcessor.process(job)
        → if pendingStore.isPending(stanzaId): resolve, do NOT re-emit
        → else: repo.upsert(message); emitter.toChat(chatId, 'message:new', dto)
```

### State / data flow
- Outbound shadow rows hold the locally generated `messageId` + `stanzaId` for reconciliation.
- Reaction state: upsert on event; remove if same emoji from same sender (toggle).

### Database considerations
- `messages(id uuid PK, chat_id varchar(128) NOT NULL, stanza_id text NOT NULL, session_id uuid FK→sessions, from_jid text NOT NULL, body text, type message_type NOT NULL, row_id bigint, sent_at timestamptz NOT NULL, created_at)`. Range-partitioned monthly by `sent_at`. Unique on `(stanza_id)` (global), index on `(chat_id, sent_at DESC)` (composite, covers pagination), BRIN on `sent_at`.
- `message_reactions(message_id uuid FK→messages ON DELETE CASCADE, sender_jid text NOT NULL, emoji text NOT NULL, created_at, PRIMARY KEY (message_id, sender_jid, emoji))`.
- `message_edits(id uuid PK, message_id uuid FK→messages ON DELETE CASCADE, previous_body text, new_body text, edited_at)`. Index `(message_id, edited_at DESC)`.
- `deleted_messages(message_id uuid PRIMARY KEY FK→messages ON DELETE CASCADE, deleted_at)`.
- `message_mentions(message_id uuid FK→messages, mentioned_jid text NOT NULL, PRIMARY KEY (message_id, mentioned_jid))`.
- `message_quotes(message_id uuid PRIMARY KEY FK→messages, quoted_stanza_id text NOT NULL, quoted_body text)`. Index `(quoted_stanza_id)`.
- `sessions(id uuid PK, name varchar(128) UNIQUE NOT NULL, status session_status NOT NULL, config jsonb, created_at, updated_at)`. `session_status` enum: `STARTING | SCAN_QR_CODE | WORKING | STOPPED | FAILED`.
- `chat_metadata(chat_id varchar(128) PRIMARY KEY, display_name_override text, last_seen_at timestamptz, updated_at)`.
- All repository reads use TypeORM's repository or `createQueryBuilder` with parameter binding, then map via `toDomain`. Raw SQL only via `dataSource.query(sql, [params])` for the optional analytics paths.
- Partition management: a small SQL helper in `infra/db/partitions.ts` creates next-month partitions; called on boot (`OnApplicationBootstrap`) and from a daily cron job (Phase 12).

### Validation strategy
- Zod request schemas per endpoint, applied via `ZodValidationPipe` on `@Body`/`@Query`/`@Param`.
- DTO mappers per response.

### Error handling
- `ChatNotFoundError`, `MessageNotFoundError`, `SessionNotFoundError`.
- WAHA failures bubble as `ExternalServiceError` and surface as 502 with a clear code via the global filter.

### Security considerations
- Policy module (`chat.policy.ts`) checks ownership/assignment before reads or writes (called from services, not guards).
- Admin override applied only in policy, never inline in controllers.

### Testing requirements
- Unit: dedup pure function, JID merge logic, reaction toggle (using `@nestjs/testing` to swap out repositories/WAHA).
- Integration: send → reconcile against webhook; edit; delete; reaction toggle round-trip.
- Cursor pagination correctness across edited messages (rowid sort).

### Performance & scalability notes
- Chat list cache: per-user 10s TTL keyed by `(userId, filtersHash)` in Redis via `CacheService.wrap`.
- Message list: pagination by SQLite rowid avoids index scans on `sentAt`.

### Final deliverables
- [x] Chat list returns correctly enriched, deduped, paginated results for admin and developer roles.
- [x] Sending a message round-trips through WAHA + webhook + reconciliation with no duplicate UI render.
- [x] Sessions can be created and reach `WORKING` end-to-end.
- [x] All socket events emit through `SocketEmitter`.

**Status: ✅ Complete** — implemented in [backend/src/modules/sessions/](backend/src/modules/sessions/), [backend/src/modules/messages/](backend/src/modules/messages/), [backend/src/modules/chats/](backend/src/modules/chats/), and the expanded webhook handlers in [backend/src/modules/webhooks/handlers/](backend/src/modules/webhooks/handlers/). 196 tests pass; lint + typecheck + build green. Migration `0003_messaging.ts` ships the full schema — `sessions`, `chat_metadata`, monthly-partitioned `messages` (with BRIN on `sent_at`), `message_reactions`/`message_edits`/`deleted_messages`/`message_mentions`/`message_quotes`, both Postgres enums, and the `ensure_messages_partition()` SQL helper plus current+next-two-month partitions. [partitions.ts](backend/src/infra/db/partitions.ts) wraps the helper for boot/cron callers. The phase-7 webhook stubs are rebound via `useExisting` to real handlers that drive `MessagesService.upsertFromWebhook` (reconciliation against `PendingMessageStore` — pending stanzas resolve silently; novel stanzas emit `message:new`), `SessionsService.applyStatusUpdate` (DB write + WAHA cache invalidate + `session:status` admin emit), plus ack/edit/reaction/revoke/group-participants emitters. `MessagesService` send/edit/delete/react/forward all go through `WahaService` with a local-shadow row keyed by a temporary `local:<uuid>` stanza id that the WAHA round-trip reconciles to the real id inside `TransactionRunner.run`. `events.contract.ts` now declares `message:new`, `message:ack`, `message:edited`, `message:deleted`, `message:reaction`, `session:status`, `group:participants`. `ChatPolicy` stub leaves developer visibility permissive; Phase 9 narrows it against `developer_assignments`. Real chat-mute integration ships in Phase 9. Live Testcontainers Postgres + MSW WAHA e2e for the send→reconcile flow lands in Phase 12.

### AI implementation prompt
> Build Phase 8 of the DevChatDesk backend: the chats, messages, and sessions domain modules. Each is its own NestJS `@Module` following the layered structure (`controller → service → repository → entity`). Author TypeORM entities `Message`, `MessageReaction`, `MessageEdit`, `DeletedMessage`, `MessageMention`, `MessageQuote`, `Session`, `ChatMetadata` with the columns, indexes, foreign keys, and enums described in the Database considerations of this phase. Generate migration `0003_messaging.ts` that creates these tables, the `message_type` and `session_status` Postgres enums, the monthly range partitions for `messages` (current month + next two months), and the indexes (including the BRIN on `messages.sent_at`). Add `infra/db/partitions.ts` with a helper to create next-month partitions plus an `OnApplicationBootstrap` check that the next 30 days of partitions exist. Implement repository layers that return domain DTOs via `toDomain(entity)` mappers — entities never escape the repository boundary. Implement chat list with visibility filtering (admins see all, developers see assigned via the `developer_assignments` table added in Phase 9 — stub the filter to "all" until Phase 9), NOWEB dual-ID dedupe (pure function), enrichment with names/avatars/last message/unread/mute status (mute stub returns false until Phase 9), and cursor pagination cached for 10 seconds per user-filter pair in Redis via `CacheService.wrap` with stampede protection. Implement messages: parallel fetch from LID + phone JIDs, merge by stanza ID, sort by SQLite rowid via `WahaStoreService.getMessageRowids`, enrich with reactions/quotes/deleted/mentions via separate small queries that the service joins in memory (not by eagerly loading TypeORM relations); send text and media via `WahaService`; edit, delete, react (toggle), forward. All multi-row writes go through `withTransaction`. Implement sessions: list/create/start/stop/delete/QR with 5s status cache invalidated on webhook. Wire the webhook handlers from Phase 7 to these services and emit `message:new`, `message:ack`, `message:edited`, `message:deleted`, `message:reaction`, `session:status`, `group:participants` through `SocketEmitter`. Implement a `chat.policy.ts` module that gates reads and writes (called from services). Tests must cover dedup, JID merge, pagination across partition boundaries, reaction toggle, and the send→webhook→reconciliation flow end-to-end (use MSW + Testcontainers Postgres + Supertest against the real Nest app).

---

# Phase 9 — Collaboration: Users, Assignments, Mute, Feedback

### Overview
Wire up the admin-facing collaboration surface: developer accounts, chat assignment, per-chat and global mute, and the feedback channel. With assignments live, the chat-visibility filter in Phase 8 becomes truly enforced.

### Objectives
- **Users**: admin CRUD; disable/enable; password reset by admin.
- **Assignments**: assign/unassign with `chat:assigned` / `chat:unassigned` socket events; history retention.
- **Mute**: per-chat mute (`chat_mutes`); global mute (`global_mutes`).
- **Feedback**: submit, list (admin-all, developer-own), mark-read.

### Features to implement
- `modules/users/` extended with admin CRUD (the `User` entity exists from Phase 3).
- `modules/assignments/` with `DeveloperAssignment` + `AssignmentHistory` entities.
- `modules/mute/` with `ChatMute` + `GlobalMute` entities.
- `modules/feedback/` with `Feedback` entity.
- Phase-8 stubs replaced with real assignment and mute calls.
- Migration `0004_collaboration.ts` creating all of the above.

### Database considerations
- `developer_assignments(id uuid PK, user_id uuid FK→users ON DELETE CASCADE, chat_id varchar(128) NOT NULL, waha_session_id uuid FK→sessions, assigned_by uuid FK→users, assigned_at timestamptz NOT NULL DEFAULT now(), unassigned_at timestamptz NULL, is_active boolean NOT NULL DEFAULT true)`. Indexes: `UNIQUE (user_id, chat_id) WHERE is_active = true` (partial unique — a developer can't have two active assignments for the same chat), `(chat_id, is_active)`, `(user_id, is_active)`, `(assigned_by, assigned_at DESC)`.
- `assignment_history(id uuid PK, assignment_id uuid FK→developer_assignments, event assignment_event NOT NULL, actor_id uuid FK→users, payload jsonb, occurred_at timestamptz NOT NULL DEFAULT now())`. `assignment_event` enum: `ASSIGNED | UNASSIGNED | REASSIGNED`. Index `(assignment_id, occurred_at DESC)`.
- `chat_mutes(user_id uuid FK→users ON DELETE CASCADE, chat_id varchar(128) NOT NULL, muted_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, chat_id))`.
- `global_mutes(user_id uuid PRIMARY KEY FK→users ON DELETE CASCADE, enabled boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now())`.
- `feedback(id uuid PK, user_id uuid FK→users, body text NOT NULL, read boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now())`. Indexes: `(user_id, created_at DESC)`, `(read, created_at DESC) WHERE read = false`.
- All writes that touch multiple tables (e.g. unassign + write history) run inside `withTransaction` so the audit trail can never diverge from the live state.

### State / data flow
- Assignment write → upsert row + history row in `withTransaction` → emit `chat:assigned` to `user:<devId>` and `admin`.
- Mute write → upsert → no socket emit needed (state read on chat list refresh and during notification dispatch).
- Disabling a user → in `withTransaction`: flip `disabled = true`, revoke all refresh-token families. Outside the transaction: force-disconnect their active sockets via `io.in(`user:${id}`).disconnectSockets()` (resolved through the gateway's exposed `Server` or via `SocketEmitter.disconnectUser(id)`).

### Validation strategy
- Email uniqueness check at service layer (don't rely solely on Postgres unique-constraint error).
- Assignment requires both target chat and target user to exist.

### Error handling
- `UserAlreadyExistsError`, `UserDisabledError`, `AssignmentExistsError`.

### Security considerations
- Only admin routes can CRUD users, assignments, view all feedback, toggle global mute — enforced by `@UseGuards(JwtAuthGuard, AdminGuard)`.
- Mute toggle authorization: developers can mute chats assigned to them; admins can mute anywhere. Enforced in service via policy.

### Testing requirements
- Disabling a user kicks them off all sockets and rejects new logins.
- Assignment events reach both the developer and admin rooms.
- Chat-list visibility now respects assignments end-to-end.

### Final deliverables
- [ ] Phase-8 visibility stubs replaced with real assignment-driven filters.
- [ ] All socket events for assignment present and tested.
- [ ] Mute respected by notification path (foreshadowing Phase 10).
- [ ] Feedback submit/list/read endpoints functional.

### AI implementation prompt
> Build Phase 9 of the DevChatDesk backend: the collaboration modules. Author TypeORM entities for `DeveloperAssignment`, `AssignmentHistory`, `ChatMute`, `GlobalMute`, and `Feedback` per this phase's Database considerations, each inside its own NestJS `@Module`. Generate migration `0004_collaboration.ts` creating the `assignment_event` enum, all tables and indexes, and the partial-unique index `UNIQUE (user_id, chat_id) WHERE is_active = true`. Implement admin CRUD over `users` in `UsersModule` (extending the entity added in Phase 3) with `@UseGuards(JwtAuthGuard, AdminGuard)` and `ZodValidationPipe` on every body; enable/disable in a single `withTransaction` that flips the `disabled` flag and revokes all refresh-token families, then (outside the transaction) disconnects active sockets via the gateway's `Server` exposed through a `SocketEmitter.disconnectUser(userId)` helper. Implement `AssignmentsModule` with POST/DELETE/GET endpoints — each mutation runs inside `withTransaction` to update `developer_assignments` and insert into `assignment_history` atomically; emit `chat:assigned`/`chat:unassigned` to the developer and admin rooms via `SocketEmitter`. Implement `MuteModule` with chat-level and global-level toggles. Implement `FeedbackModule` with submit/list/read endpoints and role-gated visibility. Replace the Phase-8 visibility stubs with a real query: `ChatsService.listChats` joins against `developer_assignments` for non-admins. Add policy enforcement so developers can only mute chats they own. Provide Testcontainers + Supertest tests for: the partial-unique constraint preventing duplicate active assignments, assignment-driven visibility, disabled-user socket eviction, mute propagation into chat-list enrichment, feedback role gating, and atomic history-on-assignment writes.

---

# Phase 10 — Observability

### Overview
Make the system measurable and traceable in production. Metrics, traces, and audit logging are added throughout the existing modules without changing their public APIs.

### Objectives
- Prometheus metrics endpoint at `/metrics` with the metrics listed in [BACKEND_ARCHITECTURE.md §13](BACKEND_ARCHITECTURE.md).
- OpenTelemetry auto-instrumentation initialized in `main.ts` **before** `NestFactory.create()`, plus custom spans on service methods.
- Audit log entries for sensitive actions (already started in Phase 3 — broaden coverage now).
- Health endpoints reflect Postgres, Redis, and WAHA reachability accurately.

### Features to implement
- `shared/observability/metrics.module.ts` — `MetricsModule` exposing `prom-client` registry + `MetricsController` at `/metrics`.
- `shared/observability/tracer.ts` — OTel SDK init, exporter to OTLP.
- `config/telemetry.ts` — invoked at the very top of `main.ts` so auto-instrumentation patches `express`, `pg`, `ioredis`, `axios`, and `bullmq` before they are imported by Nest.
- Metric instrumentation via interceptors and explicit calls in: HTTP layer (`MetricsInterceptor` applied globally), `SocketEmitter`, the queue worker harness, `WahaService`, `CacheService`.
- A `@TraceMethod()` decorator that wraps service methods in OTel spans.
- Audit log writes around: login, password change, user disable/enable, assignment changes, session start/stop/delete.

### Folder structure updates
```
backend/src/shared/observability/
├── metrics.module.ts
├── metrics.controller.ts
├── metrics.interceptor.ts
└── tracer.ts

backend/src/config/telemetry.ts
```

### Validation strategy
- Histogram buckets tuned to expected ranges (HTTP: 1ms→5s, WAHA: 10ms→30s).

### Security considerations
- `/metrics` not publicly exposed — protect via network ACL, or basic auth from env in deployment.

### Testing requirements
- Hitting endpoints increments counters.
- Trace context propagates from HTTP → queue → outbound HTTP.

### Final deliverables
- [ ] `/metrics` returns Prom-formatted text with the documented metric set.
- [ ] Traces in the configured OTLP collector connect HTTP requests to downstream queue jobs and WAHA calls.
- [ ] Audit log entries for every sensitive action.

### AI implementation prompt
> Build Phase 10 of the DevChatDesk backend: observability. Initialize OpenTelemetry in `config/telemetry.ts` and import it at the very top of `main.ts` **before** any other imports so auto-instrumentation can patch `express`, `pg` (the Postgres driver TypeORM uses), `ioredis`, `axios`, and `bullmq`; export to OTLP via an env-configured endpoint. Add `prom-client` and expose `/metrics` from a `MetricsModule` + `MetricsController` (protected via an env-configured token). Instrument HTTP via a global `MetricsInterceptor`, plus explicit instrumentation in `SocketEmitter`, the queue worker harness, `WahaService`, `CacheService`, and Postgres pool stats (`postgres_pool_active_connections`, `postgres_pool_idle_connections`, `postgres_pool_waiting_clients`) per `BACKEND_ARCHITECTURE.md §13`. Add a `@TraceMethod()` decorator that wraps service methods in custom OTel spans with the module name. Broaden audit logging beyond the auth module to cover user enable/disable, assignment changes, and session start/stop/delete. Extend `HealthModule` (`@nestjs/terminus`) so `/health/ready` checks WAHA reachability in addition to Postgres and Redis (with a short cached result so health checks don't hammer WAHA). Provide tests that hitting endpoints increments counters and that a trace context propagates from HTTP through a queue job through a Postgres query.

---

# Phase 11 — Security Hardening & Rate Limiting

### Overview
Tighten security and add the layered rate limiters described in the architecture. Pen-test the surface, lock down headers, run a dependency audit.

### Objectives
- Redis-backed rate limiters: IP, user, send, chat-list (soft), auth attempts — implemented as a `RateLimit({ ... })` guard factory.
- Stricter helmet config; CSP policy.
- Input size limits, request timeout.
- Dependency audit clean in CI.
- Cookie + CORS posture reviewed.

### Features to implement
- `common/guards/rate-limit.guard.ts` factory: `RateLimit({ key, window, max, mode: 'hard'|'soft' })` backed by Redis. Applied via `@UseGuards(RateLimit({ ... }))`.
- Apply limiters at the right routes (per `BACKEND_ARCHITECTURE.md §15`).
- Tightened CSP / Permissions-Policy headers via helmet config in `main.ts`.
- `npm audit` and Snyk in CI; failing the build on high-severity findings.

### Error handling
- Hard limiter → 429 with `Retry-After`.
- Soft limiter → cached response with `X-RateLimit-Cached: true`.

### Testing requirements
- Limiter holds across pods (set the same key from two processes, observe shared count).
- Soft-fallback serves cached data when limit hit.

### Final deliverables
- [ ] All endpoint classes from [BACKEND_ARCHITECTURE.md §15](BACKEND_ARCHITECTURE.md) covered.
- [ ] CSP and security headers verified via `securityheaders.com` simulation.
- [ ] Dependency audit clean in CI.

### AI implementation prompt
> Build Phase 11 of the DevChatDesk backend: security hardening and rate limiting. Implement a Redis-backed `RateLimit({ key, window, max, mode })` guard factory in `common/guards/rate-limit.guard.ts` and apply it per the layered limiter table in `BACKEND_ARCHITECTURE.md §15`: global IP (600/min), auth attempts (5/15min per email, with slow-down), per-user API (300/min), send (30/10s), chat list (soft, 10/5s — returns cached data with `X-RateLimit-Cached: true` when exceeded). Use `@UseGuards(RateLimit({...}))` at the controller/handler level. Tighten the `helmet()` config in `main.ts` with a strict CSP and Permissions-Policy. Set a 30s request timeout. Add `npm audit --omit=dev` and Snyk to CI; fail on high or critical findings. Add tests that prove limiters share state across pods (run two Nest processes against the same Redis) and that the soft fallback serves the last cached chat list when triggered.

---

# Phase 12 — Testing Maturity, CI/CD, Deployment

### Overview
Bring testing to the production bar, finalize CI/CD, and prepare deployment artifacts.

### Objectives
- 70% line coverage floor across the backend.
- Contract tests against the frontend (shared Zod event schemas).
- E2E smoke against a real WAHA test environment.
- Multi-stage Docker image (distroless), Kubernetes manifests, HPA configured.
- Zero-downtime rolling deploy verified.

### Features to implement
- Dockerfile (build → runtime distroless), `.dockerignore`. Build stage runs `nest build`; runtime stage launches `node dist/main.js`.
- Kubernetes manifests: Deployment, Service, ConfigMap, Secret, HPA, PodDisruptionBudget, NetworkPolicy.
- A Kubernetes `Job` template (or Helm pre-install hook) that runs `npm run migrate` against Postgres before a new app version's pods are rolled out.
- GitHub Actions: build → test → image → push → migrate (staging) → deploy (staging) → manual gate → migrate (prod) → deploy (prod).
- A daily `CronJob` that runs the partition-maintenance helper from Phase 8 to provision next-month partitions for `messages` and `audit_log`.

### Deployment considerations
- Liveness/readiness wired to `/health/live` and `/health/ready`.
- `terminationGracePeriodSeconds: 45` (matches the in-process drain budget; Nest's `app.enableShutdownHooks()` drains within this window).
- HPA on `active_socket_connections` (real-time pods) and `http_request_duration_seconds:p95` (API pods).
- Logs scraped by Loki/Datadog; metrics scraped by Prometheus; traces to Tempo/Jaeger.

### Final deliverables
- [ ] CI green on every PR.
- [ ] Staging deploy works end-to-end through real WAHA.
- [ ] Rolling deploy completes without dropped sockets (verified by the reconnection rate metric).

### AI implementation prompt
> Build Phase 12 of the DevChatDesk backend: testing maturity, CI/CD, and deployment. Raise coverage to a 70% line floor and add contract tests that statically verify the event-payload Zod schemas exported from the backend match those imported by the frontend (run as a CI job in the monorepo or via a published types package). Author a multi-stage Dockerfile producing a distroless runtime image (build stage runs `nest build` and copies `dist/` + migration files into the runtime stage; runtime stage launches `node dist/main.js`). Create Kubernetes manifests (Deployment, Service, ConfigMap, Secret, HPA, PodDisruptionBudget, NetworkPolicy) with `terminationGracePeriodSeconds: 45` and HPA targets on `active_socket_connections` and `http_request_duration_seconds:p95`. Add a `migrate` Job manifest (or Helm pre-install/pre-upgrade hook) that runs `npm run migrate` against Postgres before the new app version's pods are rolled out — deploys fail closed if migrations fail. Add a daily `CronJob` that invokes the partition-maintenance helper from Phase 8. Write a GitHub Actions workflow that builds, tests (against Testcontainers Postgres), publishes images, runs migrations against staging, deploys staging on merge to `main`, requires a manual approval gate, then runs migrations against prod and deploys prod. Provide a smoke test that deploys to a staging cluster and asserts a full login → open chat → send message flow through a real WAHA test session against a real Postgres instance.

---

## Cross-cutting checklist (verify after every phase)

- [ ] No `any` introduced.
- [ ] No business logic in controllers.
- [ ] No direct TypeORM / `DataSource` / `Repository` access outside the repository layer.
- [ ] No `synchronize: true` ever. Every schema change ships as a migration.
- [ ] No TypeORM entity escapes a repository — all returns are domain DTOs.
- [ ] No raw SQL string interpolation of user input — only parameter binding.
- [ ] All entity properties are camelCase; no `@Column({ name: '...' })` overrides except with a `// naming-override:` comment. The naming strategy is the single source of truth.
- [ ] No `console.log` — `nestjs-pino` only.
- [ ] All inbound and outbound shapes Zod-validated (HTTP via `ZodValidationPipe`, sockets via gateway pipe, queue payloads via worker harness).
- [ ] All new endpoints documented with example request/response.
- [ ] All new errors have an `AppError` subclass with a stable code.
- [ ] All new socket events added to `events.contract.ts`.
- [ ] All new queue jobs have idempotency + retry policy.
- [ ] Every new module exposes only its `service` through `exports:` — repositories and controllers stay internal.

When that checklist is true at every phase boundary, the backend stays production-ready throughout the build.
