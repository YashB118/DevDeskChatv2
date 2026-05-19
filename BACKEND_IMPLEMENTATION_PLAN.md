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
6. **Required services / modules / middlewares** — the moving pieces.
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

| Phase | Theme |
|---|---|
| **1** | Foundation: project, config, logging, error infrastructure |
| **2** | Persistence: PostgreSQL (TypeORM) + Redis + migrations + connection lifecycle |
| **3** | Authentication: JWT, refresh rotation, middleware, audit |
| **4** | Real-time core: Socket.IO + Redis adapter + typed contract |
| **5** | Queue infrastructure: BullMQ workers, idempotency, retries |
| **6** | External integration: WAHA client, resilience, SQLite store |
| **7** | Webhook ingestion: receive, normalize, fan out |
| **8** | Domain modules: chats, messages, sessions |
| **9** | Collaboration modules: assignments, mute, feedback, users |
| **10** | Observability: logs, metrics, traces, health, audit |
| **11** | Security hardening, rate limiting, abuse protection |
| **12** | Testing, CI/CD, deployment |

---

# Phase 1 — Foundation

### Overview
Stand up the Express 5 + TypeScript project skeleton, environment parsing, structured logging, centralized error handling, and the base middleware pipeline. No business logic. By the end of this phase the server starts, exposes a health endpoint, and returns a normalized JSON error for any unhandled path.

### Objectives
- Strict TypeScript project, no `any`, no implicit unknown.
- Environment validated through Zod at boot; missing/bad values crash with a clear message.
- Pino logger with correlation IDs woven through every request.
- Central error middleware producing a single error envelope.
- ESLint + Prettier + Husky pre-commit + GitHub Actions CI scaffold.

### Features to implement
- Express app composition (`app.ts`) and process bootstrap (`server.ts`).
- `config/env.ts` Zod schema.
- `config/logger.ts` Pino factory with redact list.
- `middlewares/correlation.middleware.ts` — generates or reads `X-Correlation-Id`.
- `middlewares/error.middleware.ts` — converts `AppError` and unknown errors.
- `shared/errors/AppError.ts` and subclasses.
- `/health/live`, `/health/ready` endpoints (ready returns 200 unconditionally for now).
- Branded ID types in `shared/types/ids.ts`.
- Result type in `shared/utils/result.ts`.

### Technical implementation details
- Node 20 LTS, ESM modules, TypeScript 5.x, `strict` plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`.
- Vite is not used on the backend; ts-node-dev or tsx for local dev, tsc for build.
- Pino with `pino-pretty` only in dev. Production logs are line-delimited JSON.
- Correlation middleware sets `req.correlationId` and child logger `req.log`. Augment `Express.Request` via a `.d.ts`.
- Error envelope: `{ error: { code, message, correlationId, details? } }`. Stack traces never leave the server.

### Folder structure updates
```
backend/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/{env.ts, logger.ts, constants.ts}
│   ├── middlewares/{correlation.middleware.ts, error.middleware.ts}
│   ├── shared/
│   │   ├── errors/{AppError.ts, NotFoundError.ts, ValidationError.ts, ConflictError.ts, ExternalServiceError.ts}
│   │   ├── types/{ids.ts, express.d.ts}
│   │   └── utils/{result.ts}
│   └── routes/health.routes.ts
├── tsconfig.json
├── eslint.config.ts
├── .prettierrc
├── package.json
└── .github/workflows/ci.yml
```

### Required services / modules / middlewares
- `logger` factory exporting `rootLogger` and `childLogger(bindings)`.
- `errorMiddleware` (4-arg signature).
- `correlationMiddleware`.
- `notFoundHandler` for unmatched routes (returns `NOT_FOUND` envelope).

### API flow
```
Request → correlation → logger child → route → controller → service → repo
                                                ↓ throws AppError
                                       errorMiddleware → JSON envelope
```

### Validation strategy
- `env.ts` Zod schema; `safeParse` at boot, log fail summary, `process.exit(1)`.
- Skeleton `validate(schema)` middleware that swaps `req.body|query|params` with parsed values. Used in later phases.

### Error handling
- `AppError` carries `code`, `statusCode`, `details?`, `cause?`.
- `errorMiddleware` differentiates: AppError → use its values; ZodError → 400 `VALIDATION_ERROR`; everything else → 500 `INTERNAL_ERROR` and `req.log.error` with `cause`.
- Unhandled rejection and uncaught exception handlers log and exit 1 (let the orchestrator restart).

### Security considerations
- `helmet()` with sensible defaults.
- CORS allowlist from env.
- `express.json({ limit: '2mb' })`.
- Trust proxy if behind LB (configured via env).
- Disable `x-powered-by`.

### Testing requirements
- Vitest configured with `tsconfig` paths.
- Tests:
  - `env.ts` rejects missing required vars.
  - `errorMiddleware` produces correct envelope for AppError, ZodError, unknown.
  - `correlationMiddleware` reuses incoming header or creates one.
  - Health endpoints return 200.

### Performance & scalability notes
- Single-process for now; cluster mode added at deployment phase.
- Pino async destinations enabled in production.

### Final deliverables
- [ ] `npm run dev` boots, logs structured JSON, hits `/health/live`.
- [ ] `npm run build && node dist/server.js` works.
- [ ] `npm run lint`, `npm run typecheck`, `npm test` all pass.
- [ ] CI runs lint + typecheck + tests on every PR.
- [ ] Husky pre-commit runs lint-staged.
- [ ] README documents how to run.

### AI implementation prompt
> Build Phase 1 of the DevChatDesk backend per `BACKEND_IMPLEMENTATION_PLAN.md` and `BACKEND_ARCHITECTURE.md`. Initialize an Express 5 + TypeScript (strict) project under `backend/`. Implement Zod-validated env loading at `config/env.ts`, a Pino logger with redact list at `config/logger.ts`, a correlation middleware that augments the Express Request with `correlationId` and a child logger, an `AppError` base class with `NotFoundError`, `ValidationError`, `ConflictError`, `ExternalServiceError` subclasses, and a central error middleware emitting `{ error: { code, message, correlationId } }`. Add `/health/live` and `/health/ready` endpoints. Set up ESLint (`strict-type-checked`), Prettier, Husky + lint-staged, and a GitHub Actions workflow that runs lint, typecheck, and tests. Add branded ID types (`UserId`, `ChatId`, `MessageId`, `SessionId`) and a `Result<T,E>` helper. Provide Vitest unit tests for env parsing, error middleware behaviors, and correlation propagation. No business logic — this phase is foundation only.

---

# Phase 2 — Persistence Layer

### Overview
Wire up PostgreSQL (via TypeORM) and Redis with proper lifecycle management. Connections are managed centrally with retry, graceful shutdown, and ready-probes that reflect real connectivity. The migration runner is installed in this phase so every later phase ships schema as versioned migrations from day one — `synchronize: true` is permanently off.

### Objectives
- Single TypeORM `DataSource` with pool sizing, retry on transient disconnect.
- **Naming strategy that automatically converts camelCase entity properties to snake_case database identifiers** — installed once, never overridden inline. Application code stays 100% camelCase; the database stays 100% snake_case.
- TypeORM migration runner installed; CLI scripts wired in `package.json`; `npm run migrate` applies pending migrations.
- ioredis client with retry strategy.
- `/health/ready` checks both connections (Postgres `SELECT 1`, Redis `PING`).
- Transaction helper (`withTransaction(fn)`) using a TypeORM `QueryRunner`.
- Cache service (`infra/cache/cache.service.ts`) with namespaced keys and TTL.
- Distributed lock helper (`infra/cache/distributedLock.ts`).

### Features to implement
- `infra/db/datasource.ts` — TypeORM `DataSource` factory + singleton.
- `infra/db/naming.ts` — `SnakeNamingStrategy` that overrides every relevant hook (`tableName`, `columnName`, `relationName`, `joinColumnName`, `joinTableName`, `joinTableColumnName`, `indexName`, `primaryKeyName`, `foreignKeyName`) so entity properties map to snake_case identifiers automatically. Table names are pluralized; identifier names follow deterministic patterns (`idx_<table>_<col>`, `pk_<table>`, `fk_<table>_<col>`).
- `infra/db/transactions.ts` — `withTransaction(fn, options?)` that acquires a `QueryRunner`, wraps in `BEGIN/COMMIT/ROLLBACK`, passes the scoped `EntityManager` to `fn`.
- `infra/db/migrations/` — initial empty directory plus a `0001_init.ts` placeholder migration that creates the `pg_extension` for `pgcrypto` (for `gen_random_uuid()`).
- `infra/cache/redis.ts`, `infra/cache/cache.service.ts`, `infra/cache/distributedLock.ts`.
- Boot-time connection orchestration in `server.ts` — HTTP only starts listening after both report healthy.
- Graceful shutdown: stop accepting connections → close server → close DataSource → close Redis.
- `package.json` scripts: `migrate`, `migrate:revert`, `migrate:generate`, `migrate:create`, `migrate:show`.

### Technical implementation details
- TypeORM `DataSource` options:
  - `type: 'postgres'`.
  - `synchronize: false` (enforced in all envs).
  - `logging: ['error', 'warn', 'migration']` plus `'query'` when `LOG_LEVEL=debug`.
  - `entities: [<glob to all *.entity.ts>]`, `migrations: ['src/infra/db/migrations/*.ts']`.
  - `namingStrategy: new SnakeNamingStrategy()` — the single, sole, authoritative casing converter.
  - `poolErrorHandler` logs and surfaces.
  - `extra: { max: env.PG_POOL_MAX, idleTimeoutMillis: 30000, statement_timeout: 5000, idle_in_transaction_session_timeout: 30000 }`.
- The DataSource is constructed once and exported via a module-level singleton. The bootstrap `await dataSource.initialize()` runs before HTTP listens. On failure, the process exits 1 with a clear error.
- **Naming strategy ground rules** (enforced by code review + ESLint):
  - Entity property names are always camelCase (`userId`, `tokenFamilyId`, `createdAt`).
  - `@Column`, `@JoinColumn`, `@JoinTable` do **not** receive a `name:` option except when integrating with a legacy table; deviations require a `// naming-override: <reason>` comment.
  - Indexes, primary keys, and foreign keys are named deterministically by the strategy — no manual `name:` arguments on `@Index`.
  - Raw SQL in migrations uses snake_case identifiers (matches the DB). Raw SQL inside `dataSource.query(...)` uses snake_case identifiers but always with parameter binding.

A reference implementation of the strategy lives in `infra/db/naming.ts`:

```ts
import { DefaultNamingStrategy, NamingStrategyInterface, Table } from 'typeorm';
import { snakeCase } from './case';        // small helper, no external dep
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
- Migration runner: `dataSource.runMigrations()` invoked by `scripts/migrate.ts`. CI runs migrations against an ephemeral Postgres container before tests execute.
- ioredis: `retryStrategy` exponential capped at 30s; `maxRetriesPerRequest: 3`.
- Distributed lock built on Redis `SET NX PX` plus a Lua release script (cached via `SCRIPT LOAD`); lock TTL parameter required; refresh helper provided.
- Cache service: `get/set/del/wrap`. `wrap(key, ttl, loader)` performs lock-protected stampede prevention and Zod-validates the parsed value on read.

### Folder structure updates
```
backend/src/infra/
├── db/
│   ├── datasource.ts
│   ├── naming.ts
│   ├── transactions.ts
│   ├── subscribers/           # entity subscribers (audit, updated_at touch)
│   └── migrations/
│       └── 0001_init.ts
└── cache/{redis.ts, cache.service.ts, distributedLock.ts}

backend/scripts/
├── migrate.ts                  # runs `dataSource.runMigrations()`
└── migrate-revert.ts
```

### State / data flow
```
Service.method()
   ├── cacheService.wrap('chats:user:42', 10s, () => repo.list())
   │        ├── Redis GET → hit → Zod parse → return
   │        └── miss → distributedLock.with('chats:user:42', loader)
   ├── repo.list()
   │        └── repo = AppDataSource.getRepository(Entity)
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
- TypeORM entity column types are not the validation surface — request validation always goes through Zod at the route layer (added in Phase 1).

### Error handling
- DataSource init failure → crash with a clear log line and non-zero exit.
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
  - Connection lifecycle: start → stop releases sockets.
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
- [ ] Server only starts after DataSource + Redis ready.
- [ ] `/health/ready` flips to 503 when either disconnects.
- [ ] `npm run migrate` applies migrations; `migrate:revert` rolls back; both idempotent on already-applied state.
- [ ] `synchronize: false` enforced (a lint rule or a test asserts the value).
- [ ] Naming strategy registered exactly once in the `DataSource`; unit tests confirm camelCase → snake_case across all overridden hooks.
- [ ] ESLint rule flagging `name:` inside `@Column`/`@JoinColumn`/`@JoinTable` without a `// naming-override:` comment is active.
- [ ] `withTransaction` integration test passes (commit + rollback semantics).
- [ ] Cache service unit + integration tests pass.
- [ ] Graceful shutdown drains in <30s and exits 0.

### AI implementation prompt
> Build Phase 2 of the DevChatDesk backend. Set up PostgreSQL via TypeORM and Redis under `src/infra/`. Implement `infra/db/datasource.ts` as a TypeORM `DataSource` factory with `type: 'postgres'`, `synchronize: false` (permanently off in every environment), `entities: ['src/**/*.entity.ts']`, `migrations: ['src/infra/db/migrations/*.ts']`, and `extra: { max: env.PG_POOL_MAX, statement_timeout: 5000, idle_in_transaction_session_timeout: 30000 }`. Implement `infra/db/naming.ts` exporting a `SnakeNamingStrategy` extending TypeORM's `DefaultNamingStrategy`, overriding `tableName` (snake_case + pluralize), `columnName` (snake_case including embedded prefixes), `relationName`, `joinColumnName` (`<relation>_<refColumn>`), `joinTableName`, `joinTableColumnName`, `indexName` (`idx_<table>_<col1>_<col2>[_partial]`), `primaryKeyName` (`pk_<table>`), and `foreignKeyName` (`fk_<table>_<col>`). Register the strategy via `namingStrategy: new SnakeNamingStrategy()` in the DataSource options — this is the ONLY place naming conversion happens. The codebase uses camelCase for every entity property, repository method, and DTO field; the database uses snake_case for every table, column, FK, and index. No entity should carry `@Column({ name: '...' })`, `@JoinColumn({ name: '...' })`, or `@JoinTable({ name: '...' })` overrides; if a legacy table requires it, add an `// naming-override: <reason>` comment above the decorator. Add an ESLint rule (`no-restricted-syntax` on these AST shapes) that flags such overrides when the comment is missing. Add a single initial migration `0001_init.ts` that enables the `pgcrypto` extension (for `gen_random_uuid()`). Wire `scripts/migrate.ts` and `migrate-revert.ts` plus `package.json` scripts (`migrate`, `migrate:revert`, `migrate:generate`, `migrate:create`, `migrate:show`). Implement `infra/db/transactions.ts` exporting `withTransaction(fn, options?)` that acquires a `QueryRunner`, wraps in BEGIN/COMMIT/ROLLBACK, and passes the scoped `EntityManager` into `fn`. Add ioredis (`infra/cache/redis.ts`) with exponential retry capped at 30s, a `cacheService` (`get/set/del/wrap`) where `wrap` Zod-validates parsed values and is stampede-protected by a Redis `SET NX PX` + Lua-release `distributedLock`. Wire boot orchestration in `server.ts` so HTTP only listens after both connections are healthy, and add a graceful shutdown that closes everything in reverse order on `SIGTERM`. Make `/health/ready` execute a real `SELECT 1` and Redis `PING`. Provide Testcontainers-based integration tests for: DataSource init + shutdown, `withTransaction` commit + rollback, cache stampede prevention, distributed lock semantics, migration apply/revert idempotency, and a synthetic-entity naming-strategy test that asserts every overridden hook produces the expected snake_case identifier. Do NOT introduce any domain entities in this phase.

---

# Phase 3 — Authentication

### Overview
Build the authentication module: login, refresh-token rotation, logout, password change, JWT middleware, admin middleware. Refresh tokens are opaque, hashed, family-tracked for replay detection.

### Objectives
- RS256 JWT access tokens, 15-minute TTL.
- Opaque refresh tokens stored hashed; rotated on every use; family invalidation on theft detection.
- `authMiddleware`, `adminMiddleware`.
- Bcrypt password hashing (cost 12).
- Seed script for an initial admin.
- Audit log entries on login, password change, logout.

### Features to implement
- `modules/users/` entity + repository (no admin CRUD endpoints yet — those come in Phase 9).
- `modules/auth/` module: routes, controller, service, entity (refresh tokens), schemas, types.
- `middlewares/auth.middleware.ts`, `middlewares/admin.middleware.ts`.
- `scripts/seed.ts`.
- `audit_log` table (write-only from services).
- TypeORM migration `0002_auth.ts` creating `users`, `refresh_tokens`, and `audit_log` (partitioned).

### Technical implementation details
- Access token signed with `JWT_PRIVATE_KEY`, verified with `JWT_PUBLIC_KEY` (asymmetric).
- Refresh token = `randomBytes(48).toString('base64url')`; stored as `bcrypt(token)` keyed by `{ userId, tokenFamilyId }`.
- On refresh: look up by `tokenFamilyId`, bcrypt-compare, issue new pair, invalidate old.
- On detected reuse: invalidate the entire family for that user (forces re-login on all devices).
- Cookie flags: `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/api/auth`.

### Folder structure updates
```
backend/src/modules/
├── auth/
│   ├── auth.routes.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── auth.repository.ts        # refresh token store
│   ├── auth.schema.ts            # LoginSchema, RefreshSchema, PasswordChangeSchema
│   ├── auth.types.ts
│   └── auth.test.ts
└── users/
    ├── user.entity.ts
    ├── user.repository.ts
    └── user.types.ts
```

### API flow
- `POST /api/auth/login` → validate → bcrypt compare → issue access (body) + refresh (cookie) → audit.
- `POST /api/auth/refresh` → read cookie → rotate → set new cookie → return new access.
- `POST /api/auth/logout` → invalidate family → clear cookie.
- `PATCH /api/auth/password` → authenticated → verify current → write new bcrypt hash → invalidate all refresh families → audit.

### Database considerations
- `users(id uuid PK default gen_random_uuid(), email citext UNIQUE NOT NULL, password_hash text NOT NULL, role user_role NOT NULL, display_name text NOT NULL, disabled boolean NOT NULL DEFAULT false, created_at, updated_at)`. `user_role` enum: `ADMIN | DEVELOPER`. Index: `(disabled) WHERE disabled = false` partial.
- `refresh_tokens(id uuid PK, user_id uuid FK→users ON DELETE CASCADE, family_id uuid NOT NULL, token_hash text NOT NULL, issued_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, replaced_by uuid NULL FK→refresh_tokens, revoked boolean NOT NULL DEFAULT false)`. Indexes: `(family_id)`, `(user_id, revoked)`, `(expires_at) WHERE revoked = false`.
- `audit_log(id uuid PK, user_id uuid NULL FK→users, event text NOT NULL, payload jsonb, created_at timestamptz NOT NULL DEFAULT now())`. Range-partitioned monthly by `created_at`. Indexes: `(user_id, created_at DESC)`, `(event, created_at DESC)`. A monthly cron creates the next partition; covered by a small helper migration template generated in this phase.
- All `citext` and `pgcrypto` extensions enabled via the migration.

### State / data flow
- Login: `userRepository.findByEmail(email)` → `bcrypt.compare` → issue access + refresh, INSERT `refresh_tokens`, INSERT `audit_log`.
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
- Unit: token rotation, family invalidation, password change effects.
- Integration: full login → access protected → refresh → logout flow.
- Reuse test: replay an old refresh token → entire family revoked.

### Final deliverables
- [ ] Seed creates `admin@test.com / password123` and the admin can log in.
- [ ] `authMiddleware` rejects missing/invalid/expired tokens with correct codes.
- [ ] Refresh rotation works; reuse detection invalidates the family.
- [ ] Audit log entries written on login, password change, logout.

### AI implementation prompt
> Build Phase 3 of the DevChatDesk backend: authentication. Author TypeORM entities `User` (`users` table, `citext` email unique, `user_role` enum) and `RefreshToken` (`refresh_tokens`, FK to users with ON DELETE CASCADE, `family_id`, `token_hash`, `replaced_by` self-FK, `revoked` boolean) plus `AuditLog` (`audit_log`, monthly range partitions by `created_at`, `payload jsonb`). Generate migration `0002_auth.ts` that enables `citext`, creates these tables and indexes (including the partial index `(expires_at) WHERE revoked = false`), and creates the first three months of `audit_log` partitions plus a `pg_cron`-style helper template (or a documented manual cron) for future partitions. Implement an `auth` module with login, refresh, logout, and password change endpoints, and a `users` module with the `User` entity + repository only (no CRUD endpoints in this phase). Use RS256 JWT access tokens (15 min TTL) and opaque refresh tokens stored as bcrypt hashes under a `family_id`, rotated on every refresh, with replay detection that revokes the entire family on reuse. Cookies: `HttpOnly, Secure, SameSite=Strict, Path=/api/auth`. Add `authMiddleware` and `adminMiddleware` that augment `req.user`. Repositories return domain DTOs via `toDomain(entity)` mappers — no TypeORM entity escapes the repository boundary. Use `withTransaction` for the refresh rotation. Implement append-only writes to `audit_log` from services on login, password change, logout, and refresh-reuse detection. Add `scripts/seed.ts` that idempotently upserts an initial admin. Use bcrypt cost 12. Provide Vitest unit tests for the rotation/reuse logic and Testcontainers integration tests for the full login → refresh → logout flow. Follow the layered structure: route → controller → service → repository. Controllers must stay under 15 lines.

---

# Phase 4 — Real-time Core

### Overview
Stand up Socket.IO with the Redis adapter, JWT handshake auth, room conventions, and the typed emitter. No domain events yet — just the transport with one trivial `ping/pong` event for verification.

### Objectives
- Single `initSocket(server)` initializer.
- Redis adapter wired for horizontal fan-out.
- Handshake JWT verification; failed sockets disconnected.
- Auto-join `user:<userId>` (all) and `admin` (admins).
- Per-chat join via client-emitted `chats:join`.
- Typed emitter pattern in place.
- Sequence counter primitive in Redis for missed-event resume.

### Features to implement
- `realtime/socket.server.ts`, `realtime/socket.auth.ts`, `realtime/socket.rooms.ts`, `realtime/socket.emitter.ts`.
- `realtime/events.contract.ts` with Zod schemas (just `ping` / `pong` for this phase; expanded in later phases).
- `realtime/sequence.ts` — Redis monotonic counter per event stream.

### Technical implementation details
- Transports: `['websocket']` only (no long-polling fallback in production).
- Handshake: `auth.token` carries the access JWT; verify with `JWT_PUBLIC_KEY`.
- Rooms: `roomFor.user(id)`, `roomFor.chat(id)`, `roomFor.admin()` — central naming.
- Emitter validates payload against the contract Zod schema in non-production.

### Folder structure updates
```
backend/src/realtime/
├── socket.server.ts
├── socket.auth.ts
├── socket.rooms.ts
├── socket.emitter.ts
├── events.contract.ts
└── sequence.ts
```

### WebSocket flow
```
Client connects with { auth: { token } }
   ↓
socket.auth verifies JWT
   ↓
on success: socket.data.user = payload
            socket.join(`user:${user.id}`)
            if admin: socket.join('admin')
   ↓
Client emits 'chats:join' with [chatId, ...]
   ↓
Server validates assignment access (stubbed for now → allow all in dev)
   ↓
socket.join(`chat:${chatId}`) for each authorized chat
```

### Validation strategy
- All inbound client events validated through Zod on receipt.
- Emitter validates outbound payloads in non-production builds.

### Error handling
- Auth failure → `socket.disconnect(true)` immediately with reason `unauthorized`.
- Invalid event payload → emit `error:invalid_payload` to caller and drop.

### Security considerations
- CORS configured on Socket.IO server.
- Maximum payload size enforced (`maxHttpBufferSize: 1e6`).
- Per-socket emit budget (foreshadowing rate limiting in Phase 11).

### Testing requirements
- `socket.io-client` integration test: handshake with valid/invalid token.
- Auto-join: admin joins admin room; user joins their user room.
- Multi-pod test (optional via Testcontainers): event emitted on pod A reaches client on pod B.

### Performance & scalability notes
- Redis adapter publishes to a single channel — fine for moderate scale. Sharded adapter is a Phase 12 consideration.
- Connection backpressure: server enforces `pingTimeout: 30s`, `pingInterval: 25s`.

### Final deliverables
- [ ] `initSocket(server)` initializes and listens.
- [ ] Redis adapter active.
- [ ] Auth handshake enforces JWT.
- [ ] Typed emitter compiles event names ↔ payloads.
- [ ] Sequence counter increments and reads correctly across pods.

### AI implementation prompt
> Build Phase 4 of the DevChatDesk backend: real-time core. Add Socket.IO with `socket.io-redis-adapter` wired to the existing Redis client. Implement a JWT handshake middleware that verifies access tokens and disconnects failures immediately. Auto-join `user:<userId>` for every connection and `admin` for admin users. Implement `roomFor` builders so room naming is centralized. Build a typed emitter (`SocketEmitter`) that maps event names to payload types via a Zod-backed `events.contract.ts`, with payload validation enabled outside production. Implement a Redis-backed monotonic sequence counter for future missed-event resume. Add a `ping/pong` event end-to-end as a smoke test. Provide integration tests using `socket.io-client` covering handshake auth, auto-join behavior, and (optionally) cross-pod fanout with two Testcontainers Redis-connected processes. No domain events yet.

---

# Phase 5 — Queue Infrastructure

### Overview
Set up BullMQ with a typed job contract, idempotency by job ID, retries with exponential backoff, and a generic worker harness. Add one no-op queue (`example`) to validate the pipeline end-to-end.

### Objectives
- `queues/queue.registry.ts` registers and exports all queues.
- Worker harness wraps every handler with logging, metrics, and error normalization.
- Idempotency via `jobId`.
- Graceful worker shutdown on `SIGTERM`.

### Features to implement
- `queues/queue.registry.ts`.
- `queues/worker.harness.ts` — common wrapper.
- `queues/example.queue.ts` + `queues/example.worker.ts` (deleted later; verifies the pipeline).

### Technical implementation details
- BullMQ uses ioredis. Use `connection: redis.duplicate()` per queue/worker to keep blocking commands isolated.
- Default `attempts: 5`, `backoff: { type: 'exponential', delay: 1000 }`.
- Worker harness forks a child logger with `correlationId` from the job payload.

### Folder structure updates
```
backend/src/queues/
├── queue.registry.ts
├── worker.harness.ts
├── types.ts
└── example.{queue,worker}.ts
```

### State / data flow
```
producer.add(name, payload, { jobId: hash(uniqueKey) })
   → Redis (stream)
   → worker picks → harness wraps:
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
- After max retries → move to failed; `failed` event triggers a structured `error` log with full payload.

### Security considerations
- Queue payloads may carry user identifiers but never raw secrets. The schema enforces this.

### Testing requirements
- Integration: enqueue → worker runs → assert side-effect.
- Idempotency: enqueueing the same `jobId` twice runs once.

### Final deliverables
- [ ] Example queue + worker round-trips a payload.
- [ ] Worker shutdown drains active jobs before exit.
- [ ] Metrics emit per job.

### AI implementation prompt
> Build Phase 5 of the DevChatDesk backend: BullMQ infrastructure. Create `queues/queue.registry.ts` that constructs and exports BullMQ queues using duplicated ioredis connections. Build a `worker.harness.ts` that wraps every handler with: Zod payload parsing, a correlation-id-bound child logger, success/failure logs, and a Prometheus histogram for job duration. Implement an `example` queue/worker to validate the pipeline end-to-end with an idempotency check using `jobId`. Default to `{ attempts: 5, backoff: { type: 'exponential', delay: 1000 } }`. Wire graceful shutdown in `server.ts` so workers drain before the process exits on `SIGTERM`. Provide integration tests covering retry on failure and idempotent enqueue. Do not introduce domain-specific queues in this phase — those come with the webhook phase.

---

# Phase 6 — External Integration: WAHA + SQLite Store

### Overview
Build the resilience-wrapped client for WAHA and the read-only SQLite store reader. These are the only modules allowed to talk to WAHA or the NOWEB SQLite database.

### Objectives
- `integrations/waha/waha.client.ts` — pure HTTP, no caching.
- `integrations/waha/waha.service.ts` — adds in-memory caching (10s chats, 10s sessions, 5s status), retries on idempotent calls, per-method circuit breaker, request timeouts.
- `integrations/wahaStore/waha-store.service.ts` — `getMessageRowids`, `phoneToLid`, `lidToPhone`, all with 60s in-memory caches.

### Features to implement
- Typed WAHA API surface (subset used by the app).
- Circuit breaker (`opossum` or a small custom implementation).
- SQLite reader using `better-sqlite3` opened read-only.

### Technical implementation details
- Default timeout 5s; 30s for media uploads.
- Retry only on idempotent GETs after network/5xx errors.
- Circuit breaker per method; on open → throw `ExternalServiceError(WAHA_UNAVAILABLE)`.
- SQLite path discovered from env; the reader keeps a per-session DB handle, opens lazily, never writes.

### Folder structure updates
```
backend/src/integrations/
├── waha/
│   ├── waha.client.ts
│   ├── waha.service.ts
│   └── waha.types.ts
└── wahaStore/
    ├── waha-store.service.ts
    └── waha-store.types.ts
```

### Error handling
- Convert provider errors to `ExternalServiceError` with `cause` preserved.
- Circuit breaker logs state transitions (closed → open → half-open → closed).

### Security considerations
- WAHA API key only from env, redacted in logs.
- SQLite file mounted read-only at the OS level; verified at boot.

### Testing requirements
- Unit: retry policy, circuit breaker state machine.
- Integration: stubbed WAHA server via `msw` or a local Express stub.
- SQLite: tests run against a small generated fixture DB.

### Final deliverables
- [ ] All outbound WAHA calls flow through `wahaService`.
- [ ] Circuit breaker observable via metrics.
- [ ] Phone↔LID lookup correct and cached.

### AI implementation prompt
> Build Phase 6 of the DevChatDesk backend: external integrations. Implement `integrations/waha/waha.client.ts` as a pure typed Axios wrapper for the WAHA HTTP API (session/chat/message methods used by the overview doc). Wrap it in `integrations/waha/waha.service.ts` with: 10s in-memory caches for sessions and chats, 5s for status, exponential retry on idempotent GETs, per-method circuit breaker (opening after 5 consecutive 5xx with a 30s cooldown), and request timeouts (5s default, 30s for uploads). Convert all upstream errors to `ExternalServiceError`. Implement `integrations/wahaStore/waha-store.service.ts` using `better-sqlite3` opened read-only with `getMessageRowids`, `phoneToLid`, `lidToPhone`, each with a 60s in-memory TTL cache. Provide unit tests for retry/circuit logic and integration tests against a fixture SQLite DB and an MSW-stubbed WAHA server.

---

# Phase 7 — Webhook Ingestion

### Overview
Single endpoint receives WAHA webhooks, returns 200 immediately, enqueues to BullMQ. A dedicated worker normalizes phone → LID and routes each event to the right downstream handler. Domain handlers are stubs in this phase; they are filled in by later phases.

### Objectives
- `POST /api/webhooks/waha` — Zod-validated, immediately enqueued.
- Webhook worker normalizes, dispatches, idempotent per WAHA event ID.
- Event routing table maps event types to handler functions.
- Pending message reconciliation primitive (in-memory + Redis TTL) ready for Phase 8.

### Features to implement
- `modules/webhooks/webhook.routes.ts`, `.controller.ts`, `.service.ts`.
- `queues/webhook.queue.ts`, `queues/webhook.worker.ts`.
- `modules/webhooks/dispatch.ts` — event-type → handler map.
- `modules/messages/pending.store.ts` — Redis key with 9-second TTL.

### API / queue flow
```
WAHA → POST /api/webhooks/waha
   → controller validates header signature (if configured)
   → enqueue { jobId: event.id, correlationId, payload }
   → respond 200

Worker:
   - phoneToLid normalization on JIDs
   - look up handler in dispatch table
   - handler.run(normalizedEvent)
   - emit downstream socket events (stubbed for now)
```

### Error handling
- Unknown event types → log + ack (do not retry forever).
- Handler throws → BullMQ retries.

### Security considerations
- If WAHA supports webhook signing, verify HMAC before enqueueing.
- The webhook endpoint is on a dedicated rate-limit class to absorb bursts.

### Testing requirements
- Replay an event twice → handler runs once (idempotency by `jobId`).
- Phone-format JIDs get normalized to LID before dispatch.

### Final deliverables
- [ ] Webhook acks in <50ms p95.
- [ ] Each supported event type routes to a (possibly stub) handler.
- [ ] Pending-message store exposes `add(id, ttl)`, `resolve(id)`, `isPending(id)`.

### AI implementation prompt
> Build Phase 7 of the DevChatDesk backend: WAHA webhook ingestion. Implement `POST /api/webhooks/waha` that Zod-validates the body, (optionally) verifies an HMAC signature, immediately enqueues a BullMQ job with `jobId = event.id` for idempotency, and returns 200 within milliseconds. Create `webhook.worker.ts` that normalizes phone-format JIDs to LID via `wahaStoreService.phoneToLid`, then dispatches to handler functions via a typed dispatch table keyed by event type (`message`, `message.any`, `message.ack`, `message.edited`, `message.reaction`, `session.status`, `group.v2.participants`). Implement the handlers as stubs that log and return success — they are filled in by later phases. Add a Redis-backed `pendingMessageStore` with 9-second TTL exposing `add`, `resolve`, `isPending`. Provide integration tests for: phone→LID normalization, idempotent re-delivery, retry on handler failure, and the stub dispatch.

---

# Phase 8 — Domain Modules: Chats, Messages, Sessions

### Overview
Implement the three core domain modules. Routes, controllers, services, repositories, and the webhook handler stubs from Phase 7 are now filled in. Real socket events emit from here onward.

### Objectives
- **Chats**: list with visibility filter (admin vs developer), dedupe NOWEB dual IDs, enrich, cursor pagination, 10s Redis cache; mark-read; participants; sync.
- **Messages**: cursor pagination with parallel JID merge sorted by SQLite rowid; send text/media; edit; delete; react; forward; reconciliation against pending store.
- **Sessions**: list/create/start/stop/delete; QR fetch; status caching with webhook-driven invalidation.
- All mutations emit typed socket events to the correct rooms.

### Features to implement
- `modules/chats/*`, `modules/messages/*`, `modules/sessions/*`.
- TypeORM entities: `Message`, `MessageReaction`, `MessageQuote`, `DeletedMessage`, `MessageMention`, `MessageEdit`, `Session`. (`Chat` is a virtual concept — chats live in WAHA; an optional `chat_metadata` table is created here to store per-chat overrides like display name caches.)
- Migration `0003_messaging.ts` creating all tables, indexes, and the monthly partitioning scheme for `messages`.
- Webhook handlers from Phase 7 wired to these services.
- Expanded `events.contract.ts` with `message:new`, `message:ack`, `message:edited`, `message:deleted`, `message:reaction`, `session:status`, `group:participants`.

### API flow (representative)
```
POST /api/messages/:chatId/send
   → validate (zod)
   → messageService.send(user, chatId, input)
        → policy.canSendToChat(user, chatId)
        → wahaService.sendText(session, chatId, text, quotedId)
        → repo.createOutboundShadow({...})
        → pendingStore.add(stanzaId, 9s)
        → return DTO
   → 200 { messageId }

Webhook 'message.any' arrives with same stanzaId
   → handler.run(event)
        → if pendingStore.isPending(stanzaId): resolve, do NOT re-emit
        → else: repo.upsert(message); emitter.toChat(chatId, 'message:new', dto)
```

### State / data flow
- Outbound shadow records hold the locally generated `messageId` + `stanzaId` for reconciliation.
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
- Partition management: a small SQL helper in `infra/db/partitions.ts` creates next-month partitions; called on boot and from a daily cron job.

### Validation strategy
- Zod request schemas per endpoint.
- DTO mappers per response.

### Error handling
- `ChatNotFoundError`, `MessageNotFoundError`, `SessionNotFoundError`.
- WAHA failures bubble as `ExternalServiceError` and surface as 502 with a clear code.

### Security considerations
- Policy module (`modules/chats/chat.policy.ts`) checks ownership/assignment before reads or writes.
- Admin override applied only in policy, never inline in controllers.

### Testing requirements
- Unit: dedup pure function, JID merge logic, reaction toggle.
- Integration: send → reconcile against webhook; edit; delete; reaction toggle round-trip.
- Cursor pagination correctness across edited messages (rowid sort).

### Performance & scalability notes
- Chat list cache: per-user 10s TTL keyed by `(userId, filtersHash)`.
- Message list: pagination by SQLite rowid avoids index scans on `sentAt`.

### Final deliverables
- [ ] Chat list returns correctly enriched, deduped, paginated results for admin and developer roles.
- [ ] Sending a message round-trips through WAHA + webhook + reconciliation with no duplicate UI render.
- [ ] Sessions can be created and reach `WORKING` end-to-end.
- [ ] All socket events emit through the typed emitter.

### AI implementation prompt
> Build Phase 8 of the DevChatDesk backend: the chats, messages, and sessions domain modules. Each follows the layered structure (`route → controller → service → repository → entity`). Author TypeORM entities `Message`, `MessageReaction`, `MessageEdit`, `DeletedMessage`, `MessageMention`, `MessageQuote`, `Session`, `ChatMetadata` with the columns, indexes, foreign keys, and enums described in the Database considerations of this phase. Generate migration `0003_messaging.ts` that creates these tables, the `message_type` and `session_status` enums, the monthly range partitions for `messages` (current month + next two months), and the indexes (including the BRIN on `messages.sent_at`). Add `infra/db/partitions.ts` with a helper to create next-month partitions plus a boot-time check that the next 30 days of partitions exist. Implement repository layers that return domain DTOs via `toDomain(entity)` mappers — entities never escape the repository boundary. Implement chat list with visibility filtering (admins see all, developers see assigned via the `developer_assignments` table added in Phase 9 — stub the filter to "all" until Phase 9), NOWEB dual-ID dedupe (pure function), enrichment with names/avatars/last message/unread/mute status (mute stub returns false until Phase 9), and cursor pagination cached for 10 seconds per user-filter pair in Redis with stampede protection. Implement messages: parallel fetch from LID + phone JIDs, merge by stanza ID, sort by SQLite rowid via `wahaStoreService.getMessageRowids`, enrich with reactions/quotes/deleted/mentions via separate small queries that the service joins in memory (not by eagerly loading TypeORM relations); send text and media via `wahaService`; edit, delete, react (toggle), forward. All multi-row writes go through `withTransaction`. Implement sessions: list/create/start/stop/delete/QR with 5s status cache invalidated on webhook. Wire the webhook handlers from Phase 7 to these services and emit `message:new`, `message:ack`, `message:edited`, `message:deleted`, `message:reaction`, `session:status`, `group:participants` through the typed emitter. Implement a `chat.policy.ts` module that gates reads and writes. Tests must cover dedup, JID merge, pagination across partition boundaries, reaction toggle, and the send→webhook→reconciliation flow end-to-end (use MSW + Testcontainers Postgres).

---

# Phase 9 — Collaboration: Users, Assignments, Mute, Feedback

### Overview
Wire up the admin-facing collaboration surface: developer accounts, chat assignment, per-chat and global mute, and the feedback channel. With assignments live, the chat-visibility filter in Phase 8 becomes truly enforced.

### Objectives
- **Users**: admin CRUD; disable/enable; password reset by admin.
- **Assignments**: assign/unassign with `chat:assigned` / `chat:unassigned` socket events; history retention.
- **Mute**: per-chat mute (`AdminChatMute`); global mute (`AdminGlobalMute`).
- **Feedback**: submit, list (admin-all, developer-own), mark-read.

### Features to implement
- `modules/users/*` admin CRUD (the entity exists from Phase 3).
- `modules/assignments/*` with `DeveloperAssignment` + `AssignmentHistory` entities.
- `modules/mute/*` with `ChatMute` + `GlobalMute` entities.
- `modules/feedback/*` with `Feedback` entity.
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
- Assignment write → upsert document → emit `chat:assigned` to `user:<devId>` and `admin`.
- Mute write → upsert → no socket emit needed (state read on chat list refresh and during notification dispatch).
- Disabling a user → invalidate refresh-token family + force-disconnect their active sockets via `io.in(`user:${id}`).disconnectSockets()`.

### Validation strategy
- Email uniqueness check at service layer (don't rely solely on Postgres unique-constraint error).
- Assignment requires both target chat and target user to exist.

### Error handling
- `UserAlreadyExistsError`, `UserDisabledError`, `AssignmentExistsError`.

### Security considerations
- Only admin routes can CRUD users, assignments, view all feedback, toggle global mute.
- Mute toggle authorization: developers can mute chats assigned to them; admins can mute anywhere.

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
> Build Phase 9 of the DevChatDesk backend: the collaboration modules. Author TypeORM entities for `DeveloperAssignment`, `AssignmentHistory`, `ChatMute`, `GlobalMute`, and `Feedback` per this phase's Database considerations. Generate migration `0004_collaboration.ts` creating the `assignment_event` enum, all tables and indexes, and the partial-unique index `UNIQUE (user_id, chat_id) WHERE is_active = true`. Implement admin CRUD over `users` (extending the entity added in Phase 3); enable/disable in a single `withTransaction` that flips the `disabled` flag, revokes all refresh-token families, then disconnects active sockets via `io.in(\`user:${id}\`).disconnectSockets()`. Implement `assignments` with POST/DELETE/GET endpoints — each mutation runs inside `withTransaction` to update `developer_assignments` and insert into `assignment_history` atomically; emit `chat:assigned`/`chat:unassigned` to the developer and admin rooms. Implement `mute` with chat-level and global-level toggles. Implement `feedback` with submit/list/read endpoints and role-gated visibility. Replace the Phase-8 visibility stubs with a real query: `chatService.listChats` joins against `developer_assignments` for non-admins. Add policy enforcement so developers can only mute chats they own. Provide Testcontainers tests for: the partial-unique constraint preventing duplicate active assignments, assignment-driven visibility, disabled-user socket eviction, mute propagation into chat-list enrichment, feedback role gating, and atomic history-on-assignment writes.

---

# Phase 10 — Observability

### Overview
Make the system measurable and traceable in production. Metrics, traces, and audit logging are added throughout the existing modules without changing their public APIs.

### Objectives
- Prometheus metrics endpoint at `/metrics` with the metrics listed in [BACKEND_ARCHITECTURE.md §13](BACKEND_ARCHITECTURE.md).
- OpenTelemetry auto-instrumentation + custom spans on service methods.
- Audit log entries for sensitive actions (already started in Phase 3 — broaden coverage now).
- Health endpoints reflect Postgres, Redis, and WAHA reachability accurately.

### Features to implement
- `shared/observability/metrics.ts` — prom-client registry + standard collectors.
- `shared/observability/tracer.ts` — OTel SDK init, exporter to OTLP.
- Metric instrumentation at: HTTP middleware, socket emitter, queue worker harness, WAHA service, cache service.
- Audit log writes around: login, password change, user disable/enable, assignment changes, session start/stop/delete.

### Folder structure updates
```
backend/src/shared/observability/
├── metrics.ts
└── tracer.ts
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
> Build Phase 10 of the DevChatDesk backend: observability. Initialize OpenTelemetry with auto-instrumentation for Express, `pg` (the underlying Postgres driver TypeORM uses), ioredis, BullMQ, and Axios; export to OTLP via an env-configured endpoint. Add prom-client and expose `/metrics` (protected via an env-configured token). Instrument HTTP requests, socket emits, queue jobs, WAHA calls, cache hits/misses, and Postgres pool stats (`postgres_pool_active_connections`, `postgres_pool_idle_connections`, `postgres_pool_waiting_clients`) with the metrics listed in `BACKEND_ARCHITECTURE.md §13`. Wrap service methods in custom OTel spans with the module name. Broaden audit logging beyond the auth module to cover user enable/disable, assignment changes, and session start/stop/delete. Make `/health/ready` check WAHA reachability in addition to Postgres and Redis (with a short cached result so health checks don't hammer WAHA). Provide tests that hitting endpoints increments counters and that a trace context propagates from HTTP through a queue job through a Postgres query.

---

# Phase 11 — Security Hardening & Rate Limiting

### Overview
Tighten security and add the layered rate limiters described in the architecture. Pen-test the surface, lock down headers, run a dependency audit.

### Objectives
- Redis-backed rate limiters: IP, user, send, chat-list (soft), auth attempts.
- Stricter helmet config; CSP policy.
- Input size limits, request timeout.
- Dependency audit clean in CI.
- Cookie + CORS posture reviewed.

### Features to implement
- `middlewares/rateLimit.middleware.ts` factory: `rateLimit({ key, window, max, mode: 'hard'|'soft' })` backed by Redis.
- Apply limiters at the right routes.
- CSP / Permissions-Policy headers.
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
> Build Phase 11 of the DevChatDesk backend: security hardening and rate limiting. Implement a Redis-backed `rateLimit({ key, window, max, mode })` middleware factory and apply it per the layered limiter table in `BACKEND_ARCHITECTURE.md §15`: global IP (600/min), auth attempts (5/15min per email, with slow-down), per-user API (300/min), send (30/10s), chat list (soft, 10/5s — returns cached data with `X-RateLimit-Cached: true` when exceeded). Tighten helmet with a strict CSP and Permissions-Policy. Set a 30s request timeout. Add `npm audit --omit=dev` and Snyk to CI; fail on high or critical findings. Add tests that prove limiters share state across pods (run two processes against the same Redis), and that the soft fallback serves the last cached chat list when triggered.

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
- Dockerfile (build → runtime), `.dockerignore`.
- Kubernetes manifests: Deployment, Service, ConfigMap, Secret, HPA, PodDisruptionBudget, NetworkPolicy.
- A Kubernetes `Job` template (or Helm pre-install hook) that runs `npm run migrate` against Postgres before a new app version's pods are rolled out.
- GitHub Actions: build → test → image → push → migrate (staging) → deploy (staging) → manual gate → migrate (prod) → deploy (prod).
- A daily `CronJob` that runs the partition-maintenance helper from Phase 8 to provision next-month partitions for `messages` and `audit_log`.

### Deployment considerations
- Liveness/readiness wired to `/health/live` and `/health/ready`.
- `terminationGracePeriodSeconds: 45` (matches in-process drain budget).
- HPA on `active_socket_connections` (real-time pods) and `http_request_duration_seconds:p95` (API pods).
- Logs scraped by Loki/Datadog; metrics scraped by Prometheus; traces to Tempo/Jaeger.

### Final deliverables
- [ ] CI green on every PR.
- [ ] Staging deploy works end-to-end through real WAHA.
- [ ] Rolling deploy completes without dropped sockets (verified by reconnection rate metric).

### AI implementation prompt
> Build Phase 12 of the DevChatDesk backend: testing maturity, CI/CD, and deployment. Raise coverage to a 70% line floor and add contract tests that statically verify the event-payload Zod schemas exported from the backend match those imported by the frontend (run as a CI job in the monorepo or via a published types package). Author a multi-stage Dockerfile producing a distroless runtime image (build stage compiles TypeScript and copies `dist/` + migration files into the runtime stage). Create Kubernetes manifests (Deployment, Service, ConfigMap, Secret, HPA, PodDisruptionBudget, NetworkPolicy) with `terminationGracePeriodSeconds: 45` and HPA targets on `active_socket_connections` and `http_request_duration_seconds:p95`. Add a `migrate` Job manifest (or Helm pre-install/pre-upgrade hook) that runs `npm run migrate` against Postgres before the new app version's pods are rolled out — deploys fail closed if migrations fail. Add a daily `CronJob` that invokes the partition-maintenance helper from Phase 8. Write a GitHub Actions workflow that builds, tests (against Testcontainers Postgres), publishes images, runs migrations against staging, deploys staging on merge to `main`, requires a manual approval gate, then runs migrations against prod and deploys prod. Provide a smoke test that deploys to a staging cluster and asserts a full login → open chat → send message flow through a real WAHA test session against a real Postgres instance.

---

## Cross-cutting checklist (verify after every phase)

- [ ] No `any` introduced.
- [ ] No business logic in controllers.
- [ ] No direct TypeORM / `DataSource` / `Repository` access outside the repository layer.
- [ ] No `synchronize: true` ever. Every schema change ships as a migration.
- [ ] No TypeORM entity escapes a repository — all returns are domain DTOs.
- [ ] No raw SQL string interpolation of user input — only parameter binding.
- [ ] All entity properties are camelCase; no `@Column({ name: '...' })` overrides except with a `// naming-override:` comment. The naming strategy is the single source of truth.
- [ ] No `console.log`.
- [ ] All inbound and outbound shapes Zod-validated.
- [ ] All new endpoints documented with example request/response.
- [ ] All new errors have an `AppError` subclass with a stable code.
- [ ] All new socket events added to `events.contract.ts`.
- [ ] All new queue jobs have idempotency + retry policy.

When that checklist is true at every phase boundary, the backend stays production-ready throughout the build.
