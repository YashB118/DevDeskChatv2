# Module — Database

> PostgreSQL persistence wiring. Owns the TypeORM `DataSource`, the naming strategy that converts camelCase ↔ snake_case, the migration runner, and the transaction helper.

**Files**
- `src/infra/db/database.module.ts` — `@Global()` Nest module wrapping `TypeOrmModule.forRootAsync`.
- `src/infra/db/data-source-options.ts` — builds the shared `DataSourceOptions` from `APP_CONFIG`.
- `src/infra/db/datasource.ts` — standalone `DataSource` export consumed by the TypeORM CLI (`ts-node` entry).
- `src/infra/db/naming.ts` — `SnakeNamingStrategy`.
- `src/infra/db/case.ts` — `snakeCase` helper used by the strategy and tests.
- `src/infra/db/transactions.ts` — `withTransaction(...)` + `TransactionRunner` injectable.
- `src/infra/db/migrations/0001_init.ts` — initial migration (enables `pgcrypto`).
- `scripts/migrate.ts`, `scripts/migrate-revert.ts` — CLI entry points.

---

## 1. Responsibility

- Open and lifecycle the single TypeORM `DataSource` consumed by every feature module.
- Apply a deterministic camelCase → snake_case mapping for tables, columns, relations, indexes, primary keys, and foreign keys via a single naming strategy.
- Provide a transaction helper so service code does not touch `QueryRunner` plumbing.
- Provide a standalone DataSource for the TypeORM CLI so migrations run without Nest bootstrap.
- Run migrations idempotently; `synchronize: false` is permanent.

## 2. `DataSourceOptions` (`data-source-options.ts`)

`buildDataSourceOptions(env)` is the single source of truth for connection options. Both the Nest factory in `DatabaseModule` and the standalone `datasource.ts` consume it, guaranteeing the CLI and the runtime see identical settings.

Key fields:

- `type: 'postgres'`.
- `url: env.DATABASE_URL`.
- `synchronize: false` — permanently. Do not flip this on; schema must change only through migrations.
- `logging: ['error', 'warn', 'migration']` (+ `'query'` when `LOG_LEVEL=debug` or `trace`).
- `namingStrategy: new SnakeNamingStrategy()` — see §4.
- `entities: ['src/**/*.entity.ts']` (or `dist/src/**/*.entity.js` when running from the build output).
- `migrations: ['src/infra/db/migrations/*.ts']`.
- `migrationsTableName: 'typeorm_migrations'`.
- `extra: { max: PG_POOL_MAX, idleTimeoutMillis: 30_000, statement_timeout: PG_STATEMENT_TIMEOUT_MS, idle_in_transaction_session_timeout: PG_IDLE_IN_TX_TIMEOUT_MS }`.
- `ssl: PG_SSL ? { rejectUnauthorized: true } : false` — true in production.

The function inspects `__filename` at runtime to decide whether to load `*.ts` (development / tests) or `*.js` (compiled `dist/`) entities and migrations.

## 3. `DatabaseModule`

- `@Global()` so feature modules need only `imports: [TypeOrmModule.forFeature([Entity])]` to register repositories.
- Built via `TypeOrmModule.forRootAsync({ inject: [APP_CONFIG], useFactory: (env) => buildDataSourceOptions(env) })`.
- TypeORM connects during Nest's bootstrap pass. A connection failure throws out of the factory, aborting startup before HTTP listens (this is desired — the orchestrator restarts the pod).
- Connection close is handled by Nest's TypeORM lifecycle when `app.enableShutdownHooks()` runs `onApplicationShutdown` on the underlying provider — no extra wiring needed here.

## 4. `SnakeNamingStrategy` (`naming.ts`)

Extends TypeORM's `DefaultNamingStrategy` and overrides every casing-relevant hook so the database stays 100% snake_case while application code stays 100% camelCase. **Registered exactly once**, inside `buildDataSourceOptions`. Identifier patterns:

| Hook | Pattern | Example |
| --- | --- | --- |
| `tableName(target, user?)` | `pluralize(snake_case(target))` (or `user` if provided) | `RefreshToken` → `refresh_tokens` |
| `columnName(prop, custom?, prefixes[])` | `snake_case([...prefixes, prop].join('_'))` | `tokenFamilyId` → `token_family_id` |
| `relationName(prop)` | `snake_case(prop)` | `refreshTokens` → `refresh_tokens` |
| `joinColumnName(rel, refCol)` | `<rel>_<refCol>` (both snake-cased) | `user_id` |
| `joinTableName(a, _, propA, _)` | `snake_case(a + '_' + propA)` | `users_roles` |
| `joinTableColumnName(t, prop, col?)` | `snake_case(t + '_' + (col ?? prop))` | `users_user_id` |
| `indexName(t, cols, where?)` | `idx_<t>_<col1>_<col2>[_partial]` | `idx_users_disabled_partial` |
| `primaryKeyName(t)` | `pk_<t>` | `pk_users` |
| `foreignKeyName(t, cols)` | `fk_<t>_<col1>_<col2>` | `fk_refresh_tokens_user_id` |

User-specified table/column names are honoured (escape hatch for legacy tables). Otherwise the strategy is the only place casing is converted.

### The `name:` override ban

Because the strategy is the only authority, `@Column({ name: ... })`, `@JoinColumn({ name: ... })`, and `@JoinTable({ name: ... })` are forbidden. ESLint flags them via `no-restricted-syntax` in `eslint.config.mjs`. If a legacy table truly requires a non-derived name:

```ts
// naming-override: legacy_users table predates the naming strategy
// eslint-disable-next-line no-restricted-syntax
@Column({ name: 'old_username_v1' })
username!: string;
```

Both comments are required — the override declaration documents *why*; the disable directive is what silences the rule.

## 5. Transactions (`transactions.ts`)

Two equivalent APIs:

### Injectable `TransactionRunner`

```ts
constructor(private readonly tx: TransactionRunner) {}

await this.tx.run(async (em) => {
  const users = em.getRepository(User);
  const tokens = em.getRepository(RefreshToken);
  await users.update(...);
  await tokens.insert(...);
}, { isolationLevel: 'REPEATABLE READ' });   // isolation level is optional
```

### Standalone `withTransaction`

```ts
import { withTransaction } from '@app/infra/db/transactions';
await withTransaction(dataSource, async (em) => { ... });
```

Use the standalone form when outside of Nest DI (e.g., scripts). Repositories that need to participate in a caller's transaction should accept an optional `EntityManager` parameter and default to the global manager when omitted.

Both forms:

1. Acquire a fresh `QueryRunner`.
2. `connect()` then `startTransaction(isolationLevel?)`.
3. Run the callback with the scoped `EntityManager`.
4. `commit()` on resolve, `rollback()` on throw, `release()` in a `finally`.

Do **not** call `dataSource.transaction(...)` directly — bypassing the helper risks divergent error-handling semantics.

The exported `IsolationLevel` type is a string union (`'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE'`). It is defined locally because TypeORM does not re-export its own version.

## 6. Migrations

- Live under `src/infra/db/migrations/`. The current set is just `0001_init.ts` which enables `pgcrypto` (needed for `gen_random_uuid()`).
- Filenames follow `<numeric-prefix>_<slug>.ts` ordered chronologically. The class name suffix is the numeric timestamp expected by TypeORM (`Init0001_1700000000000`).
- Raw SQL inside migrations references **snake_case identifiers** — the naming strategy does not apply to raw SQL. Always use parameter binding for any dynamic value (never string interpolation).
- Migrations run inside their own transaction (`{ transaction: 'each' }`) so a partial failure rolls back atomically.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run migrate` | Runs every pending migration. Idempotent on already-applied state. |
| `npm run migrate:revert` | Reverts the most recently applied migration. |
| `npm run migrate:generate -- src/infra/db/migrations/<Name>` | Generates a migration from the diff between entities and the live schema. |
| `npm run migrate:create -- src/infra/db/migrations/<Name>` | Writes an empty migration scaffold for hand-authored changes (extensions, partition templates, etc.). |
| `npm run migrate:show` | Lists applied and pending migrations. |
| `npm run typeorm -- <subcommand>` | Direct TypeORM CLI passthrough. |

All scripts go through `ts-node -r tsconfig-paths/register` so `@app/...` imports resolve in CLI contexts.

CI runs `npm run migrate` against an ephemeral Postgres container before the test suite executes (planned alongside the first domain-module Testcontainers harness in Phase 3). Production deploys run migrations as a one-off task **before** the new pod set starts.

## 7. Standalone DataSource (`datasource.ts`)

Loaded by the TypeORM CLI (`-d ./src/infra/db/datasource.ts`). Differences from the Nest-managed DataSource:

- Calls `dotenv.config()` so `.env` works without `--env-file` flags.
- Calls `loadEnv()` directly (no DI).
- Default-exports a constructed but **un-initialised** `DataSource`. The CLI and the migrate scripts initialise it themselves.

This file must not import anything that depends on Nest decorators — it has to be runnable from a plain `ts-node` process.

## 8. Entity authoring conventions

When Phase 3+ starts adding entities:

- Files live next to the module that owns them (`src/modules/<name>/<entity>.entity.ts`).
- Property names are camelCase. Database identifiers come from the naming strategy — never hand-pick them via `name:`.
- UUID PKs default to `gen_random_uuid()` (from `pgcrypto`).
- Use TypeORM `@Index(['camelOne', 'camelTwo'])` for composite indexes; the strategy emits `idx_<table>_camel_one_camel_two`.
- Repositories return domain DTOs via a `toDomain(entity)` mapper. No TypeORM entity escapes the repository boundary.
- Entities never own business logic — they describe the persistence shape. Behaviour lives in services.

## 9. Tests

Unit tests under `src/infra/db/`:

- `case.spec.ts` — `snakeCase` cases (camelCase, acronyms, hyphens, empty string).
- `naming.spec.ts` — every overridden hook produces the expected snake_case identifier (table, column, relation, join column, join table, join table column, index — including partial — primary key, foreign key).
- `transactions.spec.ts` — commit on resolve, rollback on throw, isolation level forwarding (using a mocked `QueryRunner`).

Testcontainers-backed integration tests (migration apply/revert idempotency, real `withTransaction` semantics against a live Postgres) land with the first domain module in Phase 3.

## 10. Common editing mistakes

| Mistake | Correct pattern |
| --- | --- |
| Adding `name:` to a column/join decorator. | Let `SnakeNamingStrategy` handle it. If unavoidable, add `// naming-override: <reason>` and the eslint-disable. |
| Calling `dataSource.transaction(...)` directly. | Inject `TransactionRunner` and use `tx.run(...)`. |
| Flipping `synchronize` to `true` "just for testing." | Use a migration. Synchronize hides drift and is permanently off. |
| Writing camelCase in raw migration SQL. | Use snake_case literally; the strategy only applies to TypeORM-generated identifiers. |
| Reading `process.env.DATABASE_URL` outside `env.ts`/`datasource.ts`. | Inject `APP_CONFIG`. |
| Letting a `QueryRunner` escape a `withTransaction` callback. | Use only the `EntityManager` passed into the callback; never store the runner. |

## 11. Future evolution

- Phase 3 introduces the first concrete entities (`User`, `RefreshToken`, `AuditLog`) and the monthly-partition helper for `audit_log`.
- Phase 5 introduces BullMQ; workers will continue to use the same `TransactionRunner` via DI.
- Phase 11 may introduce read replicas; route them through the same DataSource options (TypeORM's `replication` block) — do not branch the module.

This module is expected to grow only by adding migrations and (rarely) extending the naming-strategy override set. The runtime surface stays stable.
