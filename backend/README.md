# DevChatDesk Backend

NestJS 10 + TypeScript service.

- **Phase 1** ✅ Foundation (config, logging, error handling, health).
- **Phase 2** ✅ Persistence layer (PostgreSQL via `@nestjs/typeorm`, Redis via `ioredis`, migrations, cache, distributed lock, terminus readiness probes).

## Requirements

- Node 20 LTS
- npm 10+
- PostgreSQL 15+ (with `pgcrypto`)
- Redis 7+
- Docker (for local Postgres + Redis)

## Setup

```bash
cd backend
npm install
cp .env.example .env
# edit DATABASE_URL / REDIS_URL to match your local infra
npm run migrate
```

## Scripts

| Script | Action |
| --- | --- |
| `npm run start:dev` | Watch-mode dev server (`pino-pretty` logs). |
| `npm run build` | Compile to `dist/`. |
| `npm run start:prod` | Run compiled bundle (`node dist/main.js`). |
| `npm run lint` | ESLint (strict-type-checked). |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Vitest run. |
| `npm run test:watch` | Vitest watch. |
| `npm run test:cov` | Vitest with V8 coverage. |
| `npm run format` | Prettier write. |
| `npm run migrate` | Apply pending TypeORM migrations. |
| `npm run migrate:revert` | Revert the last migration. |
| `npm run migrate:generate -- src/infra/db/migrations/<Name>` | Generate from entity diff. |
| `npm run migrate:create -- src/infra/db/migrations/<Name>` | Create empty migration file. |
| `npm run migrate:show` | List applied / pending migrations. |

## Endpoints

- `GET /health/live` → `200 { status: "ok", ... }` (process up, no infra probes).
- `GET /health/ready` → 200 when Postgres `SELECT 1` and Redis `PING` succeed, otherwise 503 with a per-indicator breakdown via `@nestjs/terminus`.

Every response carries `X-Correlation-Id` (echoed if a valid UUID is supplied; otherwise generated).

## Error envelope

All errors return:

```json
{ "error": { "code": "STRING", "message": "STRING", "correlationId": "uuid", "details": {} } }
```

Stack traces never reach the client.

## Layout

```
src/
├── main.ts                       bootstrap (helmet, CORS, body-parser limit, shutdown hooks)
├── app.module.ts                 ConfigModule + LoggerModule + DatabaseModule + CacheModule + HealthModule
├── config/                       Zod-validated env + nestjs-pino setup
├── common/                       middleware, filters, pipes, decorators
├── shared/                       errors, branded ID types, Result helper
└── infra/
    ├── db/                       TypeORM (forRootAsync), SnakeNamingStrategy, withTransaction, migrations
    ├── cache/                    ioredis provider, CacheService (wrap/get/set/del), DistributedLockService
    └── health/                   /health/live + /health/ready (terminus DB + Redis)

scripts/
├── migrate.ts                    runs pending migrations
└── migrate-revert.ts             reverts the last migration
```

## Naming strategy

`SnakeNamingStrategy` ([src/infra/db/naming.ts](src/infra/db/naming.ts)) is the *only* place casing is converted.
Application code stays 100% camelCase; the database stays 100% snake_case.
Identifier patterns:

- Tables: `pluralize(snake_case(EntityName))` (e.g. `RefreshToken` → `refresh_tokens`).
- Columns: `snake_case(propertyName)` (e.g. `tokenFamilyId` → `token_family_id`).
- Join columns: `<relation>_<refColumn>` (e.g. `user_id`).
- Primary keys: `pk_<table>`.
- Foreign keys: `fk_<table>_<col>`.
- Indexes: `idx_<table>_<col1>_<col2>[_partial]`.

`@Column({ name: ... })`, `@JoinColumn({ name: ... })`, `@JoinTable({ name: ... })` are banned by ESLint
(`no-restricted-syntax`). If unavoidable for a legacy table, add `// naming-override: <reason>` and
disable the rule on that line with `// eslint-disable-next-line no-restricted-syntax`.

## Transactions

```ts
import { TransactionRunner } from '@app/infra/db/transactions';

constructor(private readonly tx: TransactionRunner) {}

await this.tx.run(async (em) => {
  const users = em.getRepository(User);
  // ... all writes share the same transaction; rollback on throw, commit on resolve.
});
```

The standalone `withTransaction(dataSource, fn, opts?)` exists for code outside Nest DI.

## Cache + lock

```ts
const ChatSchema = z.object({ id: z.string(), name: z.string() });
const chats = await cache.wrap(`chats:user:${id}`, () => repo.list(id), {
  ttlSeconds: 10,
  schema: ChatSchema,
});
```

`wrap` Zod-validates cached payloads and acquires a Redis `SET NX PX` lock so a cold miss runs the
loader once even under stampede; loader failure still releases the lock.

## Phase boundary

This phase ships persistence + cache + readiness probes but no domain modules. Auth, queues,
WAHA integrations, and domain APIs land in subsequent phases per
[`../BACKEND_IMPLEMENTATION_PLAN.md`](../BACKEND_IMPLEMENTATION_PLAN.md).

## Testing notes

- Unit tests cover the naming strategy, case conversion, `withTransaction` commit/rollback semantics,
  `CacheService.wrap`, and `DistributedLockService` using in-memory fakes — no Docker required.
- Testcontainers-backed integration tests for end-to-end DB + Redis behavior land alongside the first
  domain module (Phase 3) when migrations have real schema to exercise.
