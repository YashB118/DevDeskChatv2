# Backend Architecture

> Production-grade reference architecture for the DevChatDesk backend. This document defines the layering, module boundaries, communication flow, scalability strategy, and engineering standards. It is the contract every contributor builds against.

---

## 1. Architectural Philosophy

The backend is a stateless, horizontally scalable Node.js service that mediates between WAHA (WhatsApp gateway), PostgreSQL, Redis/BullMQ, and clients connected via HTTP and Socket.IO.

**Five non-negotiable principles**

1. **Layered separation.** HTTP, business logic, persistence, and external integrations never collapse into a single layer. Each module flows top-down: `route → controller → service → repository → model`. Reverse imports are forbidden.
2. **Controllers are translators, not thinkers.** A controller maps HTTP to a service call and back. Zero business logic, zero conditional branching beyond input/output mapping.
3. **Services are pure orchestration.** All workflows, validations, side-effects, and external calls live in services. Services are independently testable without spinning up Express.
4. **Stateless by default.** No in-process state survives a restart. Caches, locks, queues, and rate-limit counters all live in Redis or the database.
5. **Fail loud, observe everything.** No silent catches. Every error is logged with context; every request is traceable end-to-end via a correlation ID.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 20 LTS | Native ESM, stable performance baseline |
| Framework | Express 5 | Mature, predictable, middleware-friendly |
| Language | TypeScript (strict) | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Database | PostgreSQL 16 + TypeORM | ACID, mature partitioning, jsonb for flexible payloads |
| Migrations | TypeORM CLI (`typeorm migration:*`) | Versioned, reversible, applied at deploy |
| Cache & queue | Redis + BullMQ | Industry-standard job queue, pub/sub for socket scaling |
| Real-time | Socket.IO + Redis adapter | Horizontal-scale WebSocket fan-out |
| Validation | Zod | Single source of truth for runtime + compile-time types |
| Logging | Pino | Structured JSON, low overhead |
| Tracing | OpenTelemetry | Vendor-neutral spans, exports to OTLP |
| Metrics | Prometheus (`prom-client`) | Pull-based metrics endpoint |
| Auth | JWT (RS256) + bcrypt | Asymmetric signing keeps verification cheap on consumers |
| Testing | Vitest + Supertest + Testcontainers | Real Postgres/Redis containers for integration tests |

---

## 3. Folder Structure

The backend is feature-modular. Each module owns its full vertical slice — route, controller, service, repository, schema, types, tests. Cross-module access is only allowed through a module's exported service interface.

```
backend/
├── src/
│   ├── app.ts                       # Express app composition (no listen)
│   ├── server.ts                    # HTTP + Socket.IO bootstrap, signal handlers
│   ├── container.ts                 # Lightweight DI registry (per-request scope)
│   │
│   ├── config/
│   │   ├── env.ts                   # Zod-parsed env (single source of truth)
│   │   ├── logger.ts                # Pino root logger factory
│   │   ├── telemetry.ts             # OpenTelemetry init
│   │   └── constants.ts             # Cache TTLs, queue names, room prefixes
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.repository.ts   # Thin wrapper over TypeORM Repository
│   │   │   ├── auth.entity.ts       # TypeORM entities (User, RefreshToken)
│   │   │   ├── auth.schema.ts       # Zod input/output schemas
│   │   │   ├── auth.types.ts
│   │   │   └── auth.test.ts
│   │   ├── users/
│   │   ├── chats/
│   │   ├── messages/
│   │   ├── sessions/
│   │   ├── assignments/
│   │   ├── mute/
│   │   ├── feedback/
│   │   └── webhooks/
│   │
│   ├── realtime/
│   │   ├── socket.server.ts         # initSocket(server) — Redis adapter wiring
│   │   ├── socket.auth.ts           # JWT handshake middleware
│   │   ├── socket.rooms.ts          # Room name builders, join/leave helpers
│   │   ├── socket.emitter.ts        # Typed emitter wrapping io.to(...).emit(...)
│   │   └── events.contract.ts       # Shared event name + payload types (zod)
│   │
│   ├── queues/
│   │   ├── queue.registry.ts        # All BullMQ queues registered here
│   │   ├── webhook.queue.ts
│   │   ├── webhook.worker.ts
│   │   ├── notification.queue.ts
│   │   └── notification.worker.ts
│   │
│   ├── integrations/
│   │   ├── waha/
│   │   │   ├── waha.client.ts       # Pure HTTP client, no caching
│   │   │   ├── waha.service.ts      # Cached, retried, circuit-broken
│   │   │   └── waha.types.ts
│   │   └── wahaStore/               # SQLite read-only adapter
│   │
│   ├── middlewares/
│   │   ├── auth.middleware.ts
│   │   ├── admin.middleware.ts
│   │   ├── error.middleware.ts      # Central error normalizer
│   │   ├── correlation.middleware.ts
│   │   ├── validate.middleware.ts   # validate(schema) using zod
│   │   └── rateLimit.middleware.ts
│   │
│   ├── infra/
│   │   ├── db/
│   │   │   ├── datasource.ts        # TypeORM DataSource singleton, pool config, retry
│   │   │   ├── transactions.ts      # withTransaction(fn) helper using QueryRunner
│   │   │   ├── naming.ts            # snake_case naming strategy
│   │   │   ├── subscribers/         # TypeORM entity subscribers (audit hooks)
│   │   │   └── migrations/          # Generated SQL migrations (ts files)
│   │   ├── cache/
│   │   │   ├── redis.ts             # ioredis client
│   │   │   ├── cache.service.ts     # get/set/invalidate with namespacing
│   │   │   └── distributedLock.ts   # Redlock wrapper
│   │   └── http/
│   │       └── httpClient.ts        # Axios with retry/circuit-breaker
│   │
│   ├── shared/
│   │   ├── errors/
│   │   │   ├── AppError.ts          # Base class with code + status + cause
│   │   │   ├── ValidationError.ts
│   │   │   ├── NotFoundError.ts
│   │   │   ├── ConflictError.ts
│   │   │   └── ExternalServiceError.ts
│   │   ├── types/
│   │   │   ├── express.d.ts         # Augments Request with user, correlationId
│   │   │   └── ids.ts               # Branded types: UserId, ChatId, MessageId
│   │   ├── utils/
│   │   │   ├── result.ts            # Result<T,E> for service returns
│   │   │   ├── retry.ts
│   │   │   └── time.ts
│   │   └── observability/
│   │       ├── metrics.ts           # prom-client registry
│   │       └── tracer.ts            # OTel helpers
│   │
│   └── tests/
│       ├── fixtures/
│       ├── helpers/
│       └── integration/
│
├── scripts/
│   ├── seed.ts
│   └── migrate.ts
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

**Cross-module rule:** module A may import module B's service interface (`b.service.ts`), never B's repository, controller, or model. Repositories are internal.

---

## 4. Request Lifecycle

Every HTTP request flows through the same disciplined pipeline. Skipping a stage is never the right answer.

```
   ┌─────────────────────────────────────────────────────────────┐
   │  Inbound HTTP Request                                       │
   └─────────────────────────────────────────────────────────────┘
                              │
                              ▼
   correlationMiddleware  →  attaches X-Correlation-Id, child logger
                              │
                              ▼
   helmet / cors / json   →  baseline hardening
                              │
                              ▼
   rateLimitMiddleware    →  IP- or user-keyed limiter
                              │
                              ▼
   authMiddleware         →  verifies JWT, populates req.user
                              │
                              ▼
   validateMiddleware     →  zod parses params/query/body
                              │
                              ▼
   controller             →  unwraps validated input, calls service
                              │
                              ▼
   service                →  orchestrates repository + integrations
                              │
                              ▼
   repository / external  →  Postgres / Redis / WAHA / SQLite
                              │
                              ▼
   controller             →  shapes DTO response
                              │
                              ▼
   errorMiddleware        →  catches any thrown AppError, normalizes JSON
                              │
                              ▼
   pino access log        →  status, latency, correlation id, userId
```

**Controller skeleton (mandatory pattern):**

```ts
export const listChats = async (req: Request, res: Response) => {
  const input = ListChatsSchema.parse({
    query: req.query,
    user: req.user,
  });
  const result = await chatService.listChats(input);
  res.json(toListChatsDTO(result));
};
```

The controller does three things only: parse input, call service, map to DTO. Nothing else.

---

## 5. Layer Contracts

### 5.1 Controllers

- Thin. Typically under 15 lines.
- Never touch TypeORM repositories, Redis clients, or HTTP clients directly.
- Never `try/catch` — let `errorMiddleware` handle it. Catch only when adding context, then rethrow.
- Always run input through a Zod schema before calling the service.
- Return through a DTO mapper (`toXxxDTO`) — never leak internal documents.

### 5.2 Services

- All business logic lives here. Period.
- Stateless. No fields on the class beyond injected dependencies.
- Exposed as a singleton per-module from `xxx.service.ts`, with optional factory for testing.
- Compose other services via constructor injection (the lightweight `container.ts`), not direct imports of singletons. This keeps services trivially mockable.
- Return typed domain DTOs, never raw TypeORM entities. Convert at the repository boundary.
- All external calls (WAHA, SQLite, queues) go through their respective `integrations/` or `queues/` modules.

### 5.3 Repositories

- The only layer that talks to TypeORM (`DataSource`, `EntityManager`, `Repository<T>`).
- Each repository owns one entity (table). No cross-table queries inside a single repository — composition happens in services through repository injection.
- Methods return plain DTOs through an explicit `toDomain(entity)` mapper. TypeORM entities never leak past the repository boundary — services and controllers see only domain types.
- Queries use the repository API or `createQueryBuilder` with parameter binding. Raw SQL is forbidden outside `dataSource.query(sql, params)` for specialized analytics; user input is always bound, never interpolated.
- Index definitions live as `@Index` decorators on the entity alongside the schema. Every query path must be backed by an index — enforced by a CI step that runs `EXPLAIN ANALYZE` on representative queries against a seeded test DB.
- Eager loading is forbidden. All relations are lazy by default and loaded explicitly via `relations: { ... }` or `.leftJoinAndSelect()` so query shape is auditable in code review.

### 5.4 Schemas (Zod)

- One file per module: `xxx.schema.ts`.
- Single source of truth: derived TypeScript types via `z.infer<typeof Schema>` are exported and used by controllers, services, and tests.
- Wire-level contracts (request body, response, event payload) are all Zod-defined — the same schema validates inbound HTTP, outbound socket events, and queue jobs.

---

## 6. Error Handling

A single error vocabulary makes failures predictable.

```ts
export class AppError extends Error {
  constructor(
    public readonly code: string,         // e.g. "CHAT_NOT_FOUND"
    public readonly statusCode: number,   // HTTP status
    message: string,
    public readonly cause?: unknown,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
  }
}
```

**Rules**

- Services throw `AppError` subclasses (`NotFoundError`, `ValidationError`, `ConflictError`, `ExternalServiceError`).
- Unknown failures propagate as-is to `errorMiddleware`, which logs at `error` level and returns a sanitized 500 with the correlation ID. Never echo stack traces to clients.
- External-integration calls (WAHA, SQLite) are wrapped to convert provider errors into `ExternalServiceError` with `cause` preserved.
- The error middleware response shape is fixed:

```json
{
  "error": {
    "code": "CHAT_NOT_FOUND",
    "message": "Chat 12345@lid not found",
    "correlationId": "01HXY..."
  }
}
```

Clients code against `error.code`, never message text.

---

## 7. Validation

- Zod everywhere. Body, query, params, headers, queue payloads, socket events.
- `validate(schema)` middleware parses and replaces `req.body|query|params` with the typed result. Downstream code consumes the parsed value, not the raw one.
- Validation errors are converted to `ValidationError` with field-path detail in `details.fieldErrors`.
- No `any`, no `as` casts to bypass schemas. The linter forbids both outside the schema layer itself.

---

## 8. Authentication & Authorization

- **JWT (RS256)** access tokens, short-lived (15 min). The public key ships with the service; the private key lives in the auth signer only.
- **Refresh tokens** are opaque, stored hashed in Postgres, rotated on every use, bound to a `user_id + family_id` to detect replay.
- **Authorization** is policy-driven. Each service method that needs auth takes the authenticated principal as a parameter and consults a tiny policy module (`canReadChat(user, chat)`). Middleware does coarse gating (role); services do fine-grained gating (ownership, assignment).
- **Socket handshake** runs the same JWT verification as HTTP. Failed sockets are immediately disconnected.

---

## 9. Real-Time Architecture (Socket.IO)

### 9.1 Goals

- One persistent connection per user across browser tabs (the frontend multiplexes; the backend treats every connection as independent).
- Horizontal scaling: any backend pod can emit to any user without knowing where they connected.
- Targeted delivery: events reach only the rooms that need them.
- Strictly typed payloads — events are Zod-validated on emit AND on the client side.

### 9.2 Scaling Topology

```
                         ┌────────────┐
                         │  Redis     │
                         │  Pub/Sub   │
                         └─────┬──────┘
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
        ┌─────────┐      ┌─────────┐      ┌─────────┐
        │ API Pod │      │ API Pod │      │ API Pod │
        │   #1    │      │   #2    │      │   #3    │
        └────┬────┘      └────┬────┘      └────┬────┘
             │                │                │
             ▼                ▼                ▼
        clients          clients           clients
```

`socket.io-redis-adapter` fans out emits across pods. A user connected to pod #2 still receives events emitted from pod #1.

### 9.3 Rooms

Three room types, no others:

| Room | Members | Used for |
|---|---|---|
| `user:<userId>` | One user, all their sockets | User-targeted events (assignment, personal notifications) |
| `chat:<chatId>` | All sockets currently viewing the chat | Granular message/reaction/ack events |
| `admin` | All admin sockets | System events (session status, feedback) |

`chatId` is canonical — always LID format, normalized by the webhook handler before any emit. The same `chatId` is used as the room key on both sides, eliminating the need for a server-side lookup table.

### 9.4 Typed Emitter

```ts
// realtime/events.contract.ts
export const MessageNewPayload = z.object({
  chatId: ChatId,
  message: MessageDTO,
});

export type AppEvents = {
  'message:new':      z.infer<typeof MessageNewPayload>;
  'message:ack':      z.infer<typeof MessageAckPayload>;
  'message:edited':   z.infer<typeof MessageEditedPayload>;
  // ...
};

// realtime/socket.emitter.ts
class SocketEmitter {
  toChat<E extends keyof AppEvents>(chatId: ChatId, event: E, payload: AppEvents[E]) {
    AppEventSchemas[event].parse(payload);   // dev-mode safety
    this.io.to(roomFor.chat(chatId)).emit(event, payload);
  }
}
```

No `io.emit('something', anyObject)` calls anywhere in services. All emits flow through the typed emitter.

### 9.5 Backpressure & Reconnection

- Server enforces a per-socket emit budget; on burst (e.g. message-reaction storms), excess emits are coalesced into a single `batch:flush` envelope.
- Disconnected clients receive missed deltas via a `GET /api/sync?since=<seq>` endpoint that streams everything that changed since the client's last sequence number. Each domain event carries a monotonic `seq` from a Redis counter, enabling cheap diff replay.

---

## 10. Queue Architecture (BullMQ)

### 10.1 Why Queue?

- Webhook delivery from WAHA must ack in milliseconds; processing (DB writes, socket emits, reconciliation) is enqueued.
- Outbound notifications (push, email) are asynchronous and retryable.
- Heavy enrichment work (reaction rollups, mention extraction) is deferred to avoid blocking the request path.

### 10.2 Queue Catalog

| Queue | Producer | Worker | Concurrency | Retries |
|---|---|---|---|---|
| `webhook:waha` | Webhook controller | `webhook.worker.ts` | 16 | 5, exponential |
| `notification:push` | Message persistence | `notification.worker.ts` | 8 | 3 |
| `media:decrypt` | Frontend on-demand request | `media.worker.ts` | 4 | 2 |
| `cleanup:pending` | Cron (every minute) | `cleanup.worker.ts` | 1 | 0 |

### 10.3 Job Contract

Every job carries `{ correlationId, enqueuedAt, attempts, payload }`. The worker forks a child logger with `correlationId` so end-to-end traces tie an HTTP request to its downstream job processing.

```ts
await webhookQueue.add('process', {
  correlationId: req.correlationId,
  enqueuedAt: Date.now(),
  payload: validatedWebhook,
}, { attempts: 5, backoff: { type: 'exponential', delay: 1000 } });
```

### 10.4 Idempotency

Webhook jobs are deduplicated by `jobId = hash(event.id)` so retried deliveries from WAHA never double-write. Notification jobs are deduplicated by `messageId + userId`.

---

## 11. Caching Strategy

Three tiers, each with explicit invalidation rules. No "set it and hope it expires" caches.

| Tier | Store | Examples | TTL | Invalidation |
|---|---|---|---|---|
| **L1 — in-process** | Map-backed | Phone↔LID, JWT verification keys | 60s | TTL only |
| **L2 — Redis** | Hash + key | Chat list per user, session list | 10s | Event-driven on mutate |
| **L3 — HTTP** | `Cache-Control` | Static assets, QR SVGs | Varies | Versioned URLs |

**Invalidation contract:** every write to a cached resource is responsible for emitting an invalidation message on a Redis pub/sub channel. All pods subscribed clear their L1 copies. No background re-fetch — the next request will repopulate.

**Cache stampede protection:** `cache.service.ts` wraps repopulation in a per-key distributed lock so only one pod fetches from origin on a cold miss.

---

## 12. WAHA Integration

WAHA is an external HTTP gateway with no SLA we control. Treat it as flaky.

- **Single client.** `integrations/waha/waha.client.ts` is the only place that constructs HTTP requests to WAHA.
- **Resilience layer.** `waha.service.ts` wraps the client with:
  - Per-method circuit breaker (open after N consecutive 5xx, half-open after cooldown).
  - Exponential retry on idempotent calls.
  - Request timeouts (5s default, 30s for media uploads).
  - In-memory caches with explicit TTLs (see overview doc).
- **No service outside `integrations/waha/` ever calls WAHA.** Composition through `wahaService` only.

The SQLite store (`waha-store.service.ts`) is treated as a read-only secondary database with the same isolation rules.

---

## 13. Observability

The system is unusable in production if you cannot tell what it's doing. Three pillars:

### 13.1 Logs (Pino)

- Structured JSON, one line per event.
- Every log carries `correlationId`, `userId` (when authenticated), `module`, `event`.
- No `console.log` anywhere. The linter forbids it.

```json
{
  "level": "info",
  "time": 1716000000000,
  "correlationId": "01HXY...",
  "userId": "u_123",
  "module": "messages",
  "event": "message.sent",
  "chatId": "12345@lid",
  "latencyMs": 142
}
```

### 13.2 Metrics (Prometheus)

Standard counters and histograms exposed at `/metrics`:

- `http_request_duration_seconds{route,method,status}`
- `socket_event_emit_total{event,room_type}`
- `queue_job_duration_seconds{queue,result}`
- `waha_request_duration_seconds{method,status}`
- `cache_hit_total{tier,namespace}` and `cache_miss_total{...}`
- `active_socket_connections`
- `postgres_query_duration_seconds{operation,table}`
- `postgres_pool_active_connections`, `postgres_pool_idle_connections`, `postgres_pool_waiting_clients`

### 13.3 Traces (OpenTelemetry)

Auto-instrumented Express, `pg` (the Postgres driver TypeORM uses), ioredis, axios, BullMQ. Custom spans wrap service methods. A single `correlationId` propagates as both the OTel trace ID context and the log/metric label.

Exported to OTLP collector (compatible with Tempo, Jaeger, Datadog).

### 13.4 Health Probes

| Endpoint | Purpose |
|---|---|
| `GET /health/live` | Liveness — process is up |
| `GET /health/ready` | Readiness — Postgres, Redis, WAHA reachable |
| `GET /metrics` | Prometheus scrape target |

---

## 14. Security

- **Helmet** for baseline headers; **CORS** allowlist driven by env.
- **Bcrypt cost factor 12** for password hashes.
- **JWT RS256** so verification doesn't need the signing key.
- **HTTP-only, SameSite=Strict, Secure** cookies for refresh tokens.
- **Input sanitization** — Zod blocks everything it doesn't recognize.
- **SQL injection** prevented by parameter binding only — `repository.findBy`, `createQueryBuilder().where('x = :v', { v })`, or `dataSource.query(sql, [params])`. String interpolation of user input into SQL is a lint-failed offense.
- **Rate limiting** at three layers: IP, user, and per-endpoint-class (see §15).
- **Secrets** via environment only — never committed, never logged. The logger has a redact list (`password`, `token`, `authorization`, `cookie`).
- **Dependency scanning** in CI via `npm audit --omit=dev` and Snyk.
- **Audit logging** for sensitive actions (login, password change, assignment, user create/delete) written to a separate `audit_log` collection.

---

## 15. Rate Limiting

Layered, all backed by Redis (so limits hold across pods).

| Layer | Key | Window | Limit | On exceed |
|---|---|---|---|---|
| Global IP | `rl:ip:<ip>` | 1 min | 600 req | 429 |
| Auth attempts | `rl:auth:<email>` | 15 min | 5 fail | 429 + slow-down |
| Per-user API | `rl:user:<uid>` | 1 min | 300 req | 429 |
| Send message | `rl:send:<uid>` | 10s | 30 msg | 429 |
| Chat list | `rl:chats:<uid>` | 5s | 10 req | **Soft** — serve cached |

Soft limiters return the last good cached response with a `X-RateLimit-Cached: true` header rather than 429. They are reserved for read-heavy endpoints where a stale response is more useful than an error.

---

## 16. Configuration Management

A single Zod schema parses `process.env` at boot. Any missing or malformed value crashes the process immediately with a precise error — never at request time.

```ts
// config/env.ts
const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.string().url(),
  PG_POOL_MAX: z.coerce.number().int().positive().default(20),
  REDIS_URL: z.string().url(),
  WAHA_BASE_URL: z.string().url(),
  WAHA_API_KEY: z.string().min(1),
  JWT_PRIVATE_KEY: z.string().min(1),
  JWT_PUBLIC_KEY: z.string().min(1),
  FRONTEND_URL: z.string().url(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export const env = Env.parse(process.env);
```

Three env files: `.env` (prod), `.env.dev` (local), `.env.test` (CI). No `.env.example` drift — the Zod schema is the spec.

---

## 17. Testing Strategy

| Layer | Tool | Scope | Speed |
|---|---|---|---|
| Unit | Vitest | Pure services, mappers, validators | <1ms each |
| Integration | Vitest + Testcontainers | Service + real Postgres + real Redis | Seconds |
| Contract | Vitest + Pact (optional) | Frontend ↔ backend event shapes | Seconds |
| E2E | Playwright (in frontend repo) | Full flow through real backend | Minutes |

**Rules**

- Every service method has at least one happy-path and one failure-path test.
- Repository tests run against a real Testcontainer Postgres with migrations applied — no mocking TypeORM. A shared fixture spins one container per test file and truncates tables between tests.
- Socket-level tests use `socket.io-client` against a real ephemeral server.
- 70% line coverage threshold enforced in CI, but coverage is a floor, not a ceiling — a test must assert behavior, not just exercise lines.

---

## 18. Deployment & Scaling

- **Containerized.** Multi-stage Dockerfile, distroless runtime image.
- **Stateless pods** behind a load balancer with sticky sessions enabled for Socket.IO upgrade requests (the redis-adapter eliminates the need for stickiness in steady state, but the initial WebSocket upgrade still benefits).
- **Horizontal pod autoscaler** on `active_socket_connections` (real-time pods) and `http_request_duration_seconds:p95` (API pods).
- **Graceful shutdown**: on `SIGTERM`, the server stops accepting new connections, drains in-flight requests for up to 30s, closes BullMQ workers (so jobs aren't lost), then closes the TypeORM `DataSource` and Redis.
- **Zero-downtime deploys** via rolling updates with `readinessProbe` gating.

---

## 19. Engineering Standards

### 19.1 TypeScript Configuration

```jsonc
{
  "compilerOptions": {
    "strict": true,
    "noImplicitOverride": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

### 19.2 Branded ID Types

All entity IDs are branded to prevent passing a `UserId` where a `ChatId` is expected.

```ts
type Brand<T, B> = T & { readonly __brand: B };
export type UserId = Brand<string, 'UserId'>;
export type ChatId = Brand<string, 'ChatId'>;
```

### 19.3 Result Type for Predictable Failure

For service methods where failure is an expected branch (not an exception), return `Result<T, E>`:

```ts
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };
```

This is reserved for expected business outcomes (e.g. "user disabled"); true exceptions still throw.

### 19.4 Linting

- ESLint with `@typescript-eslint/strict-type-checked`.
- `eslint-plugin-boundaries` enforces the module dependency rules (controllers can only import from `xxx.service`, services can't import from `xxx.controller`, etc.).
- Prettier for formatting.
- Husky + lint-staged pre-commit; CI re-runs everything.

### 19.5 Database Conventions (PostgreSQL + TypeORM)

The persistence layer follows a strict set of rules. Drift here causes the most painful refactors later.

**Naming strategy (single source of truth for casing)**

The codebase uses **camelCase** everywhere — entity properties, repository methods, services, DTOs, variables. The database uses **snake_case** everywhere — tables, columns, foreign keys, indexes, junction tables, primary key constraints. Conversion is automatic and one-way: TypeORM's naming strategy translates entity metadata into SQL identifiers at load time. No code outside the strategy file performs this conversion.

`infra/db/naming.ts` exports a `SnakeNamingStrategy` (either the `typeorm-naming-strategies` package or a small custom implementation extending `DefaultNamingStrategy`) that overrides:

| Naming hook | Behavior |
|---|---|
| `tableName(className, customName)` | If `customName` provided, use as-is. Else `snake_case(pluralize(className))`. `User` → `users`, `RefreshToken` → `refresh_tokens`, `MessageReaction` → `message_reactions`. |
| `columnName(propertyName, customName, embeddedPrefixes)` | If `customName` provided, use as-is. Else `snake_case([...embeddedPrefixes, propertyName])`. `tokenFamilyId` → `token_family_id`. |
| `relationName(propertyName)` | `snake_case(propertyName)`. |
| `joinColumnName(relationName, referencedColumnName)` | `snake_case(relationName) + '_' + snake_case(referencedColumnName)`. `user` + `id` → `user_id`. |
| `joinTableName(firstTableName, secondTableName, firstPropertyName)` | `snake_case(firstTableName + '_' + firstPropertyName)`. |
| `joinTableColumnName(tableName, propertyName, columnName)` | `snake_case(tableName + '_' + (columnName ?? propertyName))`. |
| `indexName(tableOrName, columnNames, where)` | Stable deterministic name: `idx_<table>_<col1>_<col2>[_partial]`. |
| `primaryKeyName(tableOrName)` | `pk_<table>`. |
| `foreignKeyName(tableOrName, columnNames)` | `fk_<table>_<col1>_<col2>`. |

The strategy is registered exactly once in `DataSource` options. **No entity carries `@Column({ name: '...' })` or `@JoinColumn({ name: '...' })` overrides** except for two narrow cases:

1. Joining a legacy/external table whose name is fixed.
2. Mapping to a reserved word or a column that breaks the deterministic conversion.

When an override is necessary, the entity comment must state why. This is enforced by an ESLint rule that flags `name:` inside `@Column`, `@JoinColumn`, and `@JoinTable` and requires a `// naming-override: <reason>` line above it.

**Worked example**

```ts
// modules/auth/refresh-token.entity.ts
@Entity()
@Index(['familyId'])
@Index(['userId', 'revoked'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  user!: User;                          // produces FK column `user_id`

  @Column('uuid')
  userId!: string;                      // mirror of the FK for query convenience

  @Column('uuid')
  familyId!: string;                    // → family_id

  @Column('text')
  tokenHash!: string;                   // → token_hash

  @CreateDateColumn({ type: 'timestamptz' })
  issuedAt!: Date;                      // → issued_at

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;                     // → expires_at

  @Column('uuid', { nullable: true })
  replacedBy!: string | null;           // → replaced_by

  @Column({ default: false })
  revoked!: boolean;
}
```

Resulting SQL:

```sql
CREATE TABLE refresh_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id     uuid NOT NULL,
  token_hash    text NOT NULL,
  issued_at     timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  replaced_by   uuid NULL,
  revoked       boolean NOT NULL DEFAULT false,
  CONSTRAINT    pk_refresh_tokens PRIMARY KEY (id),
  CONSTRAINT    fk_refresh_tokens_user_id FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_refresh_tokens_family_id ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_tokens_user_id_revoked ON refresh_tokens (user_id, revoked);
```

The application code reads `repo.findOne({ where: { familyId, revoked: false } })` — fully camelCase, fully typed — and TypeORM emits the snake_case SQL transparently.

**Schema rules (beyond naming)**

- All primary keys are `uuid` (`gen_random_uuid()` default) — never sequential integers exposed to clients.
- All tables carry `created_at timestamptz NOT NULL DEFAULT now()` and, where mutable, `updated_at timestamptz` maintained by an entity subscriber.
- Foreign keys are explicit with `ON DELETE` behavior chosen per relationship (`CASCADE` for owned children, `RESTRICT` for references that should block deletion).
- `jsonb` only for genuinely variable payloads (raw webhook envelopes, mention structures). Never as a dumping ground for fields that could be columns.
- Raw SQL written in migrations and ad-hoc queries uses snake_case identifiers (matches what's in the database); application code never types a snake_case identifier outside of migration files and `dataSource.query(...)` strings.

**Indexes**
- Every query path is backed by an index declared via `@Index` on the entity.
- Hot composite indexes named explicitly: `idx_messages_chat_sent_at` on `(chat_id, sent_at DESC)`.
- BRIN indexes on append-mostly time columns where range scans dominate (`messages.sent_at`, `audit_log.created_at`).
- Partial indexes for "active rows only" queries: `WHERE is_active = true`.
- GIN indexes on `jsonb` columns that are queried by content.

**Partitioning**
- `messages` is range-partitioned by `sent_at` (monthly partitions). A nightly job creates the next partition; an alerting job warns if the future buffer drops below 30 days.
- `audit_log` partitioned the same way and aged out after 12 months to cold storage.
- Other tables stay non-partitioned until volume warrants it; premature partitioning is forbidden.

**Migrations**
- Every schema change is a TypeORM migration committed to `infra/db/migrations/`. Generated migrations are reviewed and edited — never merged blind.
- Migrations are forward-only in production. A rollback is a new forward migration.
- Destructive migrations (drop column, drop table) ship in two phases: a deploy that stops writing the column, then a follow-up that drops it after one full release cycle.
- `synchronize: true` is forbidden in every environment, including local — the migration runner is the only mechanism that mutates schema.

**Transactions**
- `withTransaction(fn)` wraps a `QueryRunner` and passes the scoped `EntityManager` into `fn`. All repositories accept an optional `EntityManager` parameter so they participate in the caller's transaction.
- Default isolation level: `READ COMMITTED`. Bumped to `REPEATABLE READ` only when a specific service method requires it, with a comment explaining why.
- No business logic inside transactions beyond what must be atomic. Long transactions are a deployment hazard.

**Connection pool**
- `pg-pool` sized per pod: default `max: 20`, tunable via env. HPA + pool size = total Postgres connections; PgBouncer fronted in production once total exceeds ~200.
- Statement timeout: 5 seconds for HTTP-facing queries; 30 seconds for queue workers and analytics.
- `idle_in_transaction_session_timeout = 30s` enforced at the DB level to kill stuck sessions.

**Entity contract**
- Entities live in `xxx.entity.ts`, decorated with `@Entity`, `@Index`, `@Column`, `@Relation*`.
- Entities are persistence types, not domain types. Repositories convert via `toDomain(entity)` before returning.
- No business logic on entity classes — no methods, no getters that compute state. They are dumb shapes.

### 19.6 Commit & PR Discipline

- Conventional Commits.
- PRs require: green CI, one approval, no failing checks, no unresolved review threads.
- Migrations and breaking changes call out a `BREAKING:` footer.

---

## 20. Module Snapshots

A quick orientation per module. Each follows the same layered shape; only responsibilities differ.

### 20.1 `auth`

- Owns login, refresh, logout, password change.
- Refresh token family tracking for replay detection.
- Emits `audit:auth.login` and `audit:auth.password_change`.

### 20.2 `users`

- Admin CRUD over user accounts.
- Disabling a user invalidates all their refresh tokens immediately.

### 20.3 `chats`

- Reads from WAHA via `wahaService`, joins with `assignmentRepository` for visibility filtering, with `muteRepository` for mute state, with `wahaStoreService` for dedup hints.
- The dedup logic (NOWEB dual-ID resolution) lives in `chat.service.dedup.ts`, a pure function easily unit-tested.

### 20.4 `messages`

- Cursor-paginated reads with parallel JID merging.
- Send/edit/delete/react/forward all flow through `wahaService` then persist outbound shadows for reconciliation.
- Reconciliation runs on webhook ingestion (pending → confirmed) with a 9-second TTL.

### 20.5 `sessions`

- Wraps WAHA session lifecycle.
- Caches status with 5s TTL, busted on webhook-driven status changes.

### 20.6 `assignments`

- Two normalized tables: `developer_assignments` (one row per developer–chat pair, with active flag + audit columns) plus `assignment_history` (append-only log of `assigned`/`unassigned` events). Flat schema, FK to `users` and natural-key `chat_id`.
- Indexes: `(user_id, is_active)`, `(chat_id, is_active)`, `(assigned_by, assigned_at)`.
- Mutations emit `chat:assigned` / `chat:unassigned` to both the developer's `user:<id>` room and the `admin` room.
- All chat-visibility queries route through this service.

### 20.7 `mute`

- Per-chat and global mute state.
- Consulted by notification worker before any push delivery.

### 20.8 `feedback`

- Authenticated submission, admin-only read of all.
- Trivial CRUD module — serves as the reference for module structure in onboarding.

### 20.9 `webhooks`

- Single ingestion endpoint, immediately enqueues.
- Worker is the only place webhook events are interpreted; routes per-event-type into the relevant module's service (`messageService.handleInbound`, `sessionService.handleStatusChange`, etc.).
- Normalizes phone → LID via `wahaStoreService.phoneToLid` before any persistence or emission.

---

## 21. Future-Proofing

The architecture intentionally leaves clean seams for likely future needs without building them now:

- **Multi-tenant.** All entity IDs already branded; adding a `tenant_id` column + partial indexes is a localized change.
- **Read replicas.** TypeORM `DataSource` supports a `replication` config (`master` + `slaves`). Repository methods accept an optional `readOnly` flag that picks a replica; service layer is unaffected.
- **Cross-region replication.** Redis pub/sub topology is already pod-agnostic; cross-region adds another adapter, not a rewrite.
- **GraphQL gateway.** DTOs are already shape-stable and decoupled from TypeORM entities; wrapping them is straightforward.
- **gRPC for service-to-service.** Zod schemas can be ported to protobuf with a codegen step; the service layer doesn't change.

The rule is: **don't build it until you need it, but don't paint yourself into a corner.**

---

## 22. Definition of Done

A module ships when, and only when:

1. Every public service method has a unit test and at least one integration test.
2. Every HTTP route has a request validator and a typed DTO response.
3. Every emitted socket event has a Zod-defined payload in `events.contract.ts`.
4. Every queue job has a Zod payload schema and idempotency strategy.
5. Every external call is wrapped with timeout + retry + circuit breaker.
6. Every error path is covered by a typed `AppError` subclass.
7. Every new metric/log field is added to the dashboards or excluded with rationale.
8. The module is documented in `docs/modules/<name>.md` with a sequence diagram for its primary flow.

Anything less is incomplete, regardless of whether the happy path works.
