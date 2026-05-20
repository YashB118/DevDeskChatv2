# Backend Architecture

> Production-grade reference architecture for the DevChatDesk backend. This document defines the layering, module boundaries, communication flow, scalability strategy, and engineering standards. It is the contract every contributor builds against.

---

## 1. Architectural Philosophy

The backend is a stateless, horizontally scalable **NestJS** service (Node.js runtime, Express HTTP adapter) that mediates between WAHA (WhatsApp gateway), PostgreSQL, Redis/BullMQ, and clients connected via HTTP and Socket.IO.

**Five non-negotiable principles**

1. **Layered separation.** HTTP, business logic, persistence, and external integrations never collapse into a single layer. Each feature flows top-down: `module → controller → service → repository → entity`. Reverse imports are forbidden.
2. **Controllers are translators, not thinkers.** A controller maps HTTP to a service call and back. Zero business logic, zero conditional branching beyond input/output mapping.
3. **Services are pure orchestration.** All workflows, validations, side-effects, and external calls live in `@Injectable` services. Services are independently testable via NestJS's built-in DI container without booting an HTTP listener.
4. **Stateless by default.** No in-process state survives a restart. Caches, locks, queues, and rate-limit counters all live in Redis or the database.
5. **Fail loud, observe everything.** No silent catches. Every error is logged with context; every request is traceable end-to-end via a correlation ID.

---

## 2. Technology Stack

| Concern | Choice | Rationale |
|---|---|---|
| Runtime | Node.js 20 LTS | Native ESM, stable performance baseline |
| Framework | **NestJS 10** (Express adapter) | First-class DI, modules, guards/pipes/filters/interceptors; mature ecosystem |
| Language | TypeScript (strict) | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| Database | PostgreSQL 16 + TypeORM (`@nestjs/typeorm`) | ACID, mature partitioning, jsonb for flexible payloads |
| Migrations | TypeORM CLI (`typeorm migration:*`) | Versioned, reversible, applied at deploy |
| Cache & queue | Redis + BullMQ (`@nestjs/bullmq`) | Industry-standard job queue, pub/sub for socket scaling |
| Real-time | Socket.IO via `@nestjs/websockets` + Redis adapter | Horizontal-scale WebSocket fan-out |
| Validation | **Zod** via a custom `ZodValidationPipe` | Single source of truth for runtime + compile-time types; shared with frontend |
| Logging | `nestjs-pino` | Structured JSON, low overhead, request-scoped child loggers |
| Tracing | OpenTelemetry | Vendor-neutral spans, exports to OTLP |
| Metrics | Prometheus (`prom-client`) | Pull-based metrics endpoint |
| Auth | `@nestjs/jwt` (RS256) + bcrypt | Asymmetric signing keeps verification cheap on consumers |
| Health | `@nestjs/terminus` | Composable liveness/readiness probes |
| Config | `@nestjs/config` + Zod custom validator | Env parsed once at boot, exposed via DI |
| Testing | Vitest + `@nestjs/testing` + Supertest + Testcontainers | Real Postgres/Redis containers for integration tests |

> **Why NestJS over plain Express:** the architecture leans heavily on DI, decorators for cross-cutting concerns (auth, validation, error handling), and modular composition. NestJS gives all of that out of the box — guards, pipes, interceptors, filters, and modules map 1:1 onto the layering rules below. Express remains underneath as the HTTP adapter, so `helmet`, `multer`, body parsers, and `socket.io` all integrate without ceremony.

---

## 3. Folder Structure

The backend is feature-modular. Each module owns its full vertical slice — `@Module`, `@Controller`, service, repository, entity, schema, types, tests. Cross-module access is only allowed through a module's exported service interface (declared in `exports:` of `@Module`).

```
backend/
├── src/
│   ├── main.ts                          # OTel init + Nest bootstrap + global pipes/filters
│   ├── app.module.ts                    # Root @Module composing everything
│   │
│   ├── config/
│   │   ├── env.ts                       # Zod-parsed env (single source of truth)
│   │   ├── config.module.ts             # Global ConfigModule exposing env via DI
│   │   ├── logger.module.ts             # nestjs-pino root setup (redact list, correlation binding)
│   │   ├── telemetry.ts                 # OpenTelemetry SDK init (must run BEFORE Nest creates the app)
│   │   └── constants.ts                 # Cache TTLs, queue names, room prefixes
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.repository.ts       # Thin wrapper over @InjectRepository
│   │   │   ├── auth.entity.ts           # TypeORM entities (User, RefreshToken)
│   │   │   ├── auth.schema.ts           # Zod input/output schemas
│   │   │   ├── auth.types.ts
│   │   │   └── auth.spec.ts
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
│   │   ├── realtime.module.ts
│   │   ├── realtime.gateway.ts          # @WebSocketGateway with Socket.IO
│   │   ├── ws-jwt.guard.ts              # Handshake JWT verification (CanActivate on WS)
│   │   ├── socket-redis.adapter.ts      # Custom IoAdapter wiring socket.io-redis-adapter
│   │   ├── socket.rooms.ts              # Room name builders
│   │   ├── socket.emitter.ts            # Typed wrapper over io.to(...).emit(...)
│   │   └── events.contract.ts           # Shared event name + payload Zod schemas
│   │
│   ├── queues/
│   │   ├── queue.module.ts              # @nestjs/bullmq registration for all queues
│   │   ├── webhook.processor.ts         # @Processor('webhook:waha')
│   │   ├── notification.processor.ts
│   │   ├── media.processor.ts
│   │   ├── cleanup.processor.ts
│   │   └── job.types.ts                 # Zod payload schemas per queue
│   │
│   ├── integrations/
│   │   ├── waha/
│   │   │   ├── waha.module.ts
│   │   │   ├── waha.client.ts           # Pure HTTP client, no caching
│   │   │   ├── waha.service.ts          # Cached, retried, circuit-broken
│   │   │   └── waha.types.ts
│   │   └── waha-store/
│   │       ├── waha-store.module.ts     # SQLite read-only adapter
│   │       └── waha-store.service.ts
│   │
│   ├── common/                          # Cross-cutting concerns (NestJS primitives)
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts        # @UseGuards(JwtAuthGuard)
│   │   │   └── admin.guard.ts
│   │   ├── filters/
│   │   │   └── all-exceptions.filter.ts # Global @Catch() — central error normalizer
│   │   ├── interceptors/
│   │   │   ├── correlation.interceptor.ts
│   │   │   └── logging.interceptor.ts
│   │   ├── pipes/
│   │   │   └── zod-validation.pipe.ts   # `new ZodValidationPipe(Schema)` per handler param
│   │   ├── middleware/
│   │   │   └── correlation.middleware.ts # Attaches X-Correlation-Id at the very front of the chain
│   │   └── decorators/
│   │       ├── current-user.decorator.ts # @CurrentUser() injects req.user
│   │       ├── roles.decorator.ts        # @Roles('ADMIN')
│   │       └── zod-body.decorator.ts     # @ZodBody(Schema)
│   │
│   ├── infra/
│   │   ├── db/
│   │   │   ├── database.module.ts       # TypeOrmModule.forRootAsync, pool config, retry
│   │   │   ├── datasource.ts            # Standalone DataSource for the migration CLI
│   │   │   ├── transactions.ts          # withTransaction(fn) helper using QueryRunner
│   │   │   ├── naming.ts                # snake_case naming strategy
│   │   │   ├── subscribers/             # TypeORM entity subscribers (audit hooks, updated_at)
│   │   │   └── migrations/              # Generated TS migrations
│   │   ├── cache/
│   │   │   ├── cache.module.ts
│   │   │   ├── redis.provider.ts        # ioredis factory provider
│   │   │   ├── cache.service.ts         # get/set/wrap with namespacing
│   │   │   └── distributed-lock.service.ts # Redlock wrapper
│   │   ├── http/
│   │   │   ├── http.module.ts
│   │   │   └── http-client.service.ts   # Axios with retry/circuit-breaker
│   │   └── health/
│   │       ├── health.module.ts         # @nestjs/terminus composition
│   │       └── health.controller.ts     # /health/live, /health/ready, /metrics is separate
│   │
│   ├── shared/
│   │   ├── errors/
│   │   │   ├── app.error.ts             # Base class with code + status + cause
│   │   │   ├── validation.error.ts
│   │   │   ├── not-found.error.ts
│   │   │   ├── conflict.error.ts
│   │   │   └── external-service.error.ts
│   │   ├── types/
│   │   │   ├── express.d.ts             # Augments Request with user, correlationId
│   │   │   └── ids.ts                   # Branded types: UserId, ChatId, MessageId
│   │   ├── utils/
│   │   │   ├── result.ts                # Result<T,E> for service returns
│   │   │   ├── retry.ts
│   │   │   └── time.ts
│   │   └── observability/
│   │       ├── metrics.module.ts        # prom-client registry exposed at /metrics
│   │       └── tracer.ts                # OTel helpers
│   │
│   └── tests/
│       ├── fixtures/
│       ├── helpers/
│       └── integration/
│
├── scripts/
│   ├── seed.ts
│   └── migrate.ts
├── nest-cli.json
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

**Cross-module rule:** module A may import module B's service interface (exported from B's `@Module`'s `exports:` array). It may NOT import B's controller, repository, or entity. Repositories are internal to their owning module. NestJS DI enforces this at runtime via module boundaries; ESLint enforces it statically via `eslint-plugin-boundaries`.

---

## 4. Request Lifecycle

Every HTTP request flows through the same disciplined pipeline. The NestJS execution context guarantees ordering: middleware → guards → interceptors (pre) → pipes → controller handler → interceptors (post) → exception filters.

```
   ┌─────────────────────────────────────────────────────────────┐
   │  Inbound HTTP Request                                       │
   └─────────────────────────────────────────────────────────────┘
                              │
                              ▼
   correlation.middleware  →  attaches X-Correlation-Id, request-scoped child logger
                              │
                              ▼
   helmet / cors / json    →  Express-level hardening
                              │
                              ▼
   ThrottlerGuard / custom →  IP- or user-keyed limiter (Redis-backed)
                              │
                              ▼
   JwtAuthGuard            →  verifies access token, populates req.user
                              │
                              ▼
   AdminGuard (optional)   →  role check for admin-only routes
                              │
                              ▼
   correlation.interceptor →  binds OTel span + log child to the handler
                              │
                              ▼
   ZodValidationPipe       →  parses params/query/body into typed input
                              │
                              ▼
   Controller handler      →  unwraps validated input, calls service
                              │
                              ▼
   Service                 →  orchestrates repository + integrations
                              │
                              ▼
   Repository / external   →  Postgres / Redis / WAHA / SQLite
                              │
                              ▼
   Controller              →  shapes DTO response (via mapper)
                              │
                              ▼
   AllExceptionsFilter     →  catches any thrown AppError, normalizes JSON
                              │
                              ▼
   logging.interceptor     →  emits access log with status, latency, correlation id
```

**Controller skeleton (mandatory pattern):**

```ts
@Controller('chats')
@UseGuards(JwtAuthGuard)
export class ChatsController {
  constructor(private readonly chats: ChatsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ListChatsQuerySchema)) query: ListChatsQuery,
  ): Promise<ListChatsResponse> {
    const result = await this.chats.listChats({ user, query });
    return toListChatsDTO(result);
  }
}
```

The controller does three things only: pull validated input, call the service, map to a DTO. Nothing else. Auth is delegated to a guard; validation to a pipe; errors to the global filter.

---

## 5. Layer Contracts

### 5.1 Controllers

- Thin. Typically under 15 lines per handler.
- Never touch TypeORM repositories, Redis clients, or HTTP clients directly.
- Never `try/catch` — let the global `AllExceptionsFilter` handle it. Catch only when adding context, then rethrow.
- Always validate every input through a `ZodValidationPipe` before the handler body runs.
- Return through a DTO mapper (`toXxxDTO`) — never leak TypeORM entities or internal types.
- Use `@CurrentUser()`, `@CorrelationId()`, and other custom decorators to keep handler signatures clean.

### 5.2 Services

- All business logic lives here. Period.
- `@Injectable({ scope: Scope.DEFAULT })` (singleton) by default. Per-request scope is reserved for services that genuinely need request-bound state and is justified case-by-case.
- Constructor injection only. No `private static` singletons, no module-level instances.
- Return typed domain DTOs, never raw TypeORM entities. Convert at the repository boundary.
- All external calls (WAHA, SQLite, queues) go through their respective `integrations/` or `queues/` providers, also injected via the constructor.
- Cross-module service usage: import the producing module in your `@Module({ imports: [...] })`, then inject the service. NestJS DI rejects unresolved providers at boot — a missing import fails fast.

### 5.3 Repositories

- The only layer that talks to TypeORM (`DataSource`, `EntityManager`, `Repository<T>`).
- Each repository owns one entity (table). No cross-table queries inside a single repository — composition happens in services through repository injection.
- Injected via `@InjectRepository(Entity)` internally; exposed to services as a thin wrapper class (`XxxRepository`) so the TypeORM API stays inside the boundary.
- Methods return plain DTOs through an explicit `toDomain(entity)` mapper. TypeORM entities never leak past the repository boundary — services and controllers see only domain types.
- Queries use the repository API or `createQueryBuilder` with parameter binding. Raw SQL is forbidden outside `dataSource.query(sql, params)` for specialized analytics; user input is always bound, never interpolated.
- Index definitions live as `@Index` decorators on the entity alongside the schema. Every query path must be backed by an index — enforced by a CI step that runs `EXPLAIN ANALYZE` on representative queries against a seeded test DB.
- Eager loading is forbidden. All relations are lazy by default and loaded explicitly via `relations: { ... }` or `.leftJoinAndSelect()` so query shape is auditable in code review.

### 5.4 Schemas (Zod)

- One file per module: `xxx.schema.ts`.
- Single source of truth: derived TypeScript types via `z.infer<typeof Schema>` are exported and used by controllers, services, and tests.
- Wire-level contracts (request body, response, event payload, queue job payload) are all Zod-defined — the same schema validates inbound HTTP, outbound socket events, and queue jobs.
- The custom `ZodValidationPipe` parses the request part it's bound to (`@Body`, `@Query`, `@Param`) and throws a `ValidationError` (mapped to 400 by the global filter) with field-path details on failure.

```ts
// common/pipes/zod-validation.pipe.ts
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}
  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) throw new ValidationError('VALIDATION_FAILED', parsed.error);
    return parsed.data;
  }
}
```

### 5.5 Modules

- One `@Module` per feature. Declares `controllers`, `providers`, `imports`, `exports`.
- `exports:` is the public API of the module. Anything not exported is internal.
- Shared infrastructure (database, cache, http, logger, config) lives in `@Global()` modules under `infra/` and `config/` so feature modules consume them without re-importing.

---

## 6. Error Handling

A single error vocabulary makes failures predictable. NestJS's exception filter mechanism gives us exactly one place to normalize them.

```ts
export class AppError extends Error {
  constructor(
    public readonly code: string,         // e.g. "CHAT_NOT_FOUND"
    public readonly statusCode: number,   // HTTP status
    message: string,
    public readonly cause?: unknown,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
```

**Rules**

- Services throw `AppError` subclasses (`NotFoundError`, `ValidationError`, `ConflictError`, `ExternalServiceError`).
- Unknown failures propagate to the global `AllExceptionsFilter`, which logs at `error` level and returns a sanitized 500 with the correlation ID. Never echo stack traces to clients.
- External-integration calls (WAHA, SQLite) are wrapped to convert provider errors into `ExternalServiceError` with `cause` preserved.
- The `AllExceptionsFilter` is registered globally in `main.ts` via `app.useGlobalFilters(...)`. Per-controller filters are forbidden — one filter, one envelope.
- The response shape is fixed:

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
- `ZodValidationPipe` is applied per parameter (`@Body(new ZodValidationPipe(Schema))`) or via a custom decorator (`@ZodBody(Schema)`) that bundles the two. Class-validator is NOT used — Zod is the only validation surface.
- Validation errors throw `ValidationError` with `details.fieldErrors` carrying the Zod path → message map; the global filter renders them as 400 with the same envelope as all other errors.
- No `any`, no `as` casts to bypass schemas. The linter forbids both outside the schema layer itself.
- WebSocket events run through Zod inside the gateway before dispatch. Queue handlers run their payload through Zod inside the worker harness before the business handler is called.

---

## 8. Authentication & Authorization

- **JWT (RS256)** access tokens, short-lived (15 min), issued by `@nestjs/jwt`. The public key ships with every pod; the private key lives only in the auth signer.
- **Refresh tokens** are opaque, stored hashed in Postgres, rotated on every use, bound to a `user_id + family_id` to detect replay.
- **`JwtAuthGuard`** is a `CanActivate` guard that verifies the bearer token and populates `req.user`. Applied either at the controller level (`@UseGuards(JwtAuthGuard)`) or globally with `@Public()` decorator opt-outs for login/refresh/health/webhooks.
- **`AdminGuard`** runs after `JwtAuthGuard` and asserts `req.user.role === ADMIN`. Used on admin-only controllers.
- **Authorization (fine-grained)** is policy-driven and lives in services, not guards. Each service method that needs auth takes the authenticated principal as a parameter and consults a tiny policy module (`canReadChat(user, chat)`). Guards do coarse gating (authenticated, admin); services do ownership/assignment checks.
- **Socket handshake** runs the same JWT verification as HTTP via a custom `WsAuthGuard` applied to the gateway. Failed sockets are immediately disconnected.

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

`socket.io-redis-adapter` (registered through a custom `IoAdapter` in `realtime/socket-redis.adapter.ts`) fans out emits across pods. A user connected to pod #2 still receives events emitted from pod #1.

### 9.3 Rooms

Three room types, no others:

| Room | Members | Used for |
|---|---|---|
| `user:<userId>` | One user, all their sockets | User-targeted events (assignment, personal notifications) |
| `chat:<chatId>` | All sockets currently viewing the chat | Granular message/reaction/ack events |
| `admin` | All admin sockets | System events (session status, feedback) |

`chatId` is canonical — always LID format, normalized by the webhook processor before any emit. The same `chatId` is used as the room key on both sides, eliminating the need for a server-side lookup table.

### 9.4 Gateway + Typed Emitter

```ts
// realtime/realtime.gateway.ts
@WebSocketGateway({ cors: { origin: env.FRONTEND_URL } })
@UseGuards(WsAuthGuard)
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() io!: Server;
  constructor(private readonly emitter: SocketEmitter) {}

  handleConnection(client: AuthSocket) {
    client.join(roomFor.user(client.data.user.id));
    if (client.data.user.role === 'ADMIN') client.join(roomFor.admin());
  }

  @SubscribeMessage('chats:join')
  onJoinChats(@MessageBody(new ZodValidationPipe(JoinChatsSchema)) body: JoinChats, @ConnectedSocket() client: AuthSocket) {
    for (const chatId of body.chatIds) client.join(roomFor.chat(chatId));
  }
}

// realtime/events.contract.ts
export const MessageNewPayload = z.object({ chatId: ChatId, message: MessageDTO });

export type AppEvents = {
  'message:new':      z.infer<typeof MessageNewPayload>;
  'message:ack':      z.infer<typeof MessageAckPayload>;
  'message:edited':   z.infer<typeof MessageEditedPayload>;
  // ...
};

// realtime/socket.emitter.ts
@Injectable()
export class SocketEmitter {
  constructor(@Inject(IO_SERVER) private readonly io: Server) {}
  toChat<E extends keyof AppEvents>(chatId: ChatId, event: E, payload: AppEvents[E]) {
    AppEventSchemas[event].parse(payload);   // dev-mode safety
    this.io.to(roomFor.chat(chatId)).emit(event, payload);
  }
}
```

No `io.emit('something', anyObject)` calls anywhere in services. All emits flow through the typed `SocketEmitter` provider.

### 9.5 Backpressure & Reconnection

- Server enforces a per-socket emit budget; on burst (e.g. message-reaction storms), excess emits are coalesced into a single `batch:flush` envelope.
- Disconnected clients receive missed deltas via a `GET /api/sync?since=<seq>` endpoint that streams everything that changed since the client's last sequence number. Each domain event carries a monotonic `seq` from a Redis counter, enabling cheap diff replay.

---

## 10. Queue Architecture (BullMQ)

### 10.1 Why Queue?

- Webhook delivery from WAHA must ack in milliseconds; processing (DB writes, socket emits, reconciliation) is enqueued.
- Outbound notifications (push, email) are asynchronous and retryable.
- Heavy enrichment work (reaction rollups, mention extraction) is deferred to avoid blocking the request path.

### 10.2 NestJS Integration

`@nestjs/bullmq` provides `BullModule.registerQueue(...)` for producers and `@Processor('queue:name')` for workers. Producers inject queues via `@InjectQueue('queue:name')`; workers are NestJS providers with `@Process()` handlers, which means DI, logging, metrics, and tracing are available without extra wiring.

### 10.3 Queue Catalog

| Queue | Producer | Processor | Concurrency | Retries |
|---|---|---|---|---|
| `webhook:waha` | Webhook controller | `WebhookProcessor` | 16 | 5, exponential |
| `notification:push` | Message service | `NotificationProcessor` | 8 | 3 |
| `media:decrypt` | Frontend on-demand request | `MediaProcessor` | 4 | 2 |
| `cleanup:pending` | Cron (every minute) | `CleanupProcessor` | 1 | 0 |

### 10.4 Job Contract

Every job carries `{ correlationId, enqueuedAt, attempts, payload }`. The processor forks a child logger with `correlationId` so end-to-end traces tie an HTTP request to its downstream job processing.

```ts
@Processor('webhook:waha')
export class WebhookProcessor extends WorkerHost {
  constructor(private readonly webhookSvc: WebhookService, @InjectPinoLogger() private readonly log: Logger) { super(); }

  async process(job: Job<WebhookJobPayload>) {
    const payload = WebhookJobSchema.parse(job.data.payload);
    const log = this.log.child({ correlationId: job.data.correlationId, jobId: job.id });
    await this.webhookSvc.handle(payload, log);
  }
}
```

Producers:

```ts
@InjectQueue('webhook:waha') private readonly webhookQueue: Queue;
// ...
await this.webhookQueue.add('process', {
  correlationId: req.correlationId,
  enqueuedAt: Date.now(),
  payload: validatedWebhook,
}, { attempts: 5, backoff: { type: 'exponential', delay: 1000 } });
```

### 10.5 Idempotency

Webhook jobs are deduplicated by `jobId = hash(event.id)` so retried deliveries from WAHA never double-write. Notification jobs are deduplicated by `messageId + userId`.

---

## 11. Caching Strategy

Three tiers, each with explicit invalidation rules. No "set it and hope it expires" caches.

| Tier | Store | Examples | TTL | Invalidation |
|---|---|---|---|---|
| **L1 — in-process** | Map-backed (per-provider singleton) | Phone↔LID, JWT verification keys | 60s | TTL only |
| **L2 — Redis** | Hash + key | Chat list per user, session list | 10s | Event-driven on mutate |
| **L3 — HTTP** | `Cache-Control` | Static assets, QR SVGs | Varies | Versioned URLs |

**Invalidation contract:** every write to a cached resource is responsible for emitting an invalidation message on a Redis pub/sub channel. All pods subscribed clear their L1 copies. No background re-fetch — the next request will repopulate.

**Cache stampede protection:** `CacheService.wrap(key, ttl, loader)` wraps repopulation in a per-key distributed lock so only one pod fetches from origin on a cold miss.

---

## 12. WAHA Integration

WAHA is an external HTTP gateway with no SLA we control. Treat it as flaky.

- **Single client.** `integrations/waha/waha.client.ts` is the only place that constructs HTTP requests to WAHA. It is provided by `WahaModule` and injected nowhere outside it.
- **Resilience layer.** `WahaService` wraps the client with:
  - Per-method circuit breaker (open after N consecutive 5xx, half-open after cooldown).
  - Exponential retry on idempotent calls.
  - Request timeouts (5s default, 30s for media uploads).
  - In-memory caches with explicit TTLs.
- **Only `WahaModule` exports `WahaService`.** Any module that needs WAHA imports `WahaModule` and depends on the service via constructor injection.

The SQLite store (`WahaStoreService` in `integrations/waha-store/`) is treated as a read-only secondary database with the same isolation rules.

---

## 13. Observability

The system is unusable in production if you cannot tell what it's doing. Three pillars.

### 13.1 Logs (`nestjs-pino`)

- Structured JSON, one line per event.
- Every log carries `correlationId`, `userId` (when authenticated), `module`, `event`.
- `nestjs-pino` ships per-request child loggers automatically; services inject `@InjectPinoLogger(ModuleName) private readonly log: PinoLogger`.
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

Standard counters and histograms exposed at `/metrics` (registered via a dedicated `MetricsModule` and `MetricsController`):

- `http_request_duration_seconds{route,method,status}`
- `socket_event_emit_total{event,room_type}`
- `queue_job_duration_seconds{queue,result}`
- `waha_request_duration_seconds{method,status}`
- `cache_hit_total{tier,namespace}` and `cache_miss_total{...}`
- `active_socket_connections`
- `postgres_query_duration_seconds{operation,table}`
- `postgres_pool_active_connections`, `postgres_pool_idle_connections`, `postgres_pool_waiting_clients`

### 13.3 Traces (OpenTelemetry)

OpenTelemetry SDK initialization runs in `config/telemetry.ts`, imported at the very top of `main.ts` **before** `NestFactory.create()` so auto-instrumentation patches `express`, `pg` (the Postgres driver TypeORM uses), `ioredis`, `axios`, and `bullmq` before any of them is constructed. Custom spans wrap service methods via a `@TraceMethod()` decorator. A single `correlationId` propagates as both the OTel trace ID context and the log/metric label.

Exported to OTLP collector (compatible with Tempo, Jaeger, Datadog).

### 13.4 Health Probes

Implemented with `@nestjs/terminus`:

| Endpoint | Purpose |
|---|---|
| `GET /health/live` | Liveness — process is up |
| `GET /health/ready` | Readiness — Postgres, Redis, WAHA reachable (the WAHA check is cached briefly so probes don't hammer it) |
| `GET /metrics` | Prometheus scrape target (network-ACL protected) |

---

## 14. Security

- **Helmet** for baseline headers (`app.use(helmet())` in `main.ts`); **CORS** allowlist driven by env.
- **Bcrypt cost factor 12** for password hashes.
- **JWT RS256** so verification doesn't need the signing key.
- **HTTP-only, SameSite=Strict, Secure** cookies for refresh tokens.
- **Input sanitization** — Zod blocks everything it doesn't recognize.
- **SQL injection** prevented by parameter binding only — `repository.findBy`, `createQueryBuilder().where('x = :v', { v })`, or `dataSource.query(sql, [params])`. String interpolation of user input into SQL is a lint-failed offense.
- **Rate limiting** at three layers: IP, user, and per-endpoint-class (see §15). Implemented as Redis-backed guards so limits hold across pods.
- **Secrets** via environment only — never committed, never logged. The pino redact list includes `password`, `token`, `authorization`, `cookie`.
- **Dependency scanning** in CI via `npm audit --omit=dev` and Snyk.
- **Audit logging** for sensitive actions (login, password change, assignment, user create/delete) written to a separate `audit_log` partitioned table.

---

## 15. Rate Limiting

Layered, all backed by Redis (so limits hold across pods). Implemented as a `RateLimitGuard` factory that takes a config object; applied per-controller via `@UseGuards(RateLimit({ ... }))`.

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

A single Zod schema parses `process.env` at boot. The `ConfigModule` consumes the validated object and exposes it through DI via an injection token (`APP_CONFIG`). Any missing or malformed value crashes the process immediately with a precise error — never at request time.

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

export type AppEnv = z.infer<typeof Env>;
export const env: AppEnv = Env.parse(process.env);

// config/config.module.ts
@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useValue: env }],
  exports: [APP_CONFIG],
})
export class ConfigModule {}
```

Three env files: `.env` (prod), `.env.dev` (local), `.env.test` (CI). No `.env.example` drift — the Zod schema is the spec.

---

## 17. Testing Strategy

| Layer | Tool | Scope | Speed |
|---|---|---|---|
| Unit | Vitest + `@nestjs/testing` | Pure services, mappers, validators (using `Test.createTestingModule({...}).compile()`) | <1ms each |
| Integration | Vitest + Testcontainers | Service + real Postgres + real Redis, wired via a real `TestingModule` | Seconds |
| Contract | Vitest + Pact (optional) | Frontend ↔ backend event shapes | Seconds |
| E2E | Supertest against `INestApplication` | Full HTTP flow through the real Nest pipeline | Seconds |
| Browser E2E | Playwright (in frontend repo) | Full flow through real backend | Minutes |

**Rules**

- Every service method has at least one happy-path and one failure-path test.
- `@nestjs/testing` lets us instantiate any provider with selectively overridden dependencies — preferred over mocking modules wholesale.
- Repository tests run against a real Testcontainer Postgres with migrations applied — no mocking TypeORM. A shared fixture spins one container per test file and truncates tables between tests.
- Socket-level tests use `socket.io-client` against a real ephemeral Nest app instance.
- 70% line coverage threshold enforced in CI, but coverage is a floor, not a ceiling — a test must assert behavior, not just exercise lines.

---

## 18. Deployment & Scaling

- **Containerized.** Multi-stage Dockerfile, distroless runtime image. The build stage compiles TypeScript with `nest build`; the runtime stage runs `node dist/main.js`.
- **Stateless pods** behind a load balancer with sticky sessions enabled for Socket.IO upgrade requests (the redis-adapter eliminates the need for stickiness in steady state, but the initial WebSocket upgrade still benefits).
- **Horizontal pod autoscaler** on `active_socket_connections` (real-time pods) and `http_request_duration_seconds:p95` (API pods).
- **Graceful shutdown** via `app.enableShutdownHooks()` and `OnApplicationShutdown` lifecycle hooks. On `SIGTERM`: stop accepting new connections, drain in-flight requests for up to 30s, close BullMQ workers (so jobs aren't lost), then close the TypeORM `DataSource` and Redis clients.
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
    "verbatimModuleSyntax": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

(`experimentalDecorators` and `emitDecoratorMetadata` are required by NestJS; everything else mirrors the frontend strictness.)

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

The strategy is registered exactly once — in the `TypeOrmModule.forRootAsync()` options inside `DatabaseModule`. **No entity carries `@Column({ name: '...' })` or `@JoinColumn({ name: '...' })` overrides** except for two narrow cases:

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
- The TypeORM CLI uses a dedicated `infra/db/datasource.ts` standalone export (no Nest bootstrap) so migrations run without needing the full DI container.

**Transactions**
- `withTransaction(fn)` (`infra/db/transactions.ts`) wraps a `QueryRunner` and passes the scoped `EntityManager` into `fn`. All repositories accept an optional `EntityManager` parameter so they participate in the caller's transaction.
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

A quick orientation per module. Each follows the same layered shape (`@Module → @Controller → @Injectable service → repository → @Entity`); only responsibilities differ.

### 20.1 `auth`

- Owns login, refresh, logout, password change.
- Refresh token family tracking for replay detection.
- Emits `audit:auth.login` and `audit:auth.password_change`.

### 20.2 `users`

- Admin CRUD over user accounts.
- Disabling a user invalidates all their refresh tokens immediately and disconnects active sockets via `io.in(`user:${id}`).disconnectSockets()`.

### 20.3 `chats`

- Reads from WAHA via `WahaService`, joins with `AssignmentRepository` for visibility filtering, with `MuteRepository` for mute state, with `WahaStoreService` for dedup hints.
- The dedup logic (NOWEB dual-ID resolution) lives in a pure helper exported from the module (`chat-dedup.ts`), easily unit-tested.

### 20.4 `messages`

- Cursor-paginated reads with parallel JID merging.
- Send/edit/delete/react/forward all flow through `WahaService` then persist outbound shadows for reconciliation.
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
- Consulted by the notification processor before any push delivery.

### 20.8 `feedback`

- Authenticated submission, admin-only read of all.
- Trivial CRUD module — serves as the reference for module structure in onboarding.

### 20.9 `webhooks`

- Single ingestion endpoint, immediately enqueues to the `webhook:waha` BullMQ queue.
- `WebhookProcessor` is the only place webhook events are interpreted; routes per-event-type into the relevant module's service (`MessageService.handleInbound`, `SessionService.handleStatusChange`, etc.) by injecting them in its constructor.
- Normalizes phone → LID via `WahaStoreService.phoneToLid` before any persistence or emission.

---

## 21. Future-Proofing

The architecture intentionally leaves clean seams for likely future needs without building them now:

- **Multi-tenant.** All entity IDs already branded; adding a `tenant_id` column + partial indexes is a localized change.
- **Read replicas.** TypeORM `DataSource` supports a `replication` config (`master` + `slaves`). Repository methods accept an optional `readOnly` flag that picks a replica; service layer is unaffected.
- **Cross-region replication.** Redis pub/sub topology is already pod-agnostic; cross-region adds another adapter, not a rewrite.
- **GraphQL gateway.** DTOs are already shape-stable and decoupled from TypeORM entities; layering `@nestjs/graphql` on top is straightforward.
- **gRPC for service-to-service.** Zod schemas can be ported to protobuf with a codegen step; NestJS supports gRPC microservice transports natively.
- **Microservice split.** NestJS modules already encapsulate domains — promoting one to a standalone microservice is a deployment change, not an architectural one.

The rule is: **don't build it until you need it, but don't paint yourself into a corner.**

---

## 22. Definition of Done

A module ships when, and only when:

1. Every public service method has a unit test and at least one integration test.
2. Every HTTP route has a request validator (`ZodValidationPipe`) and a typed DTO response.
3. Every emitted socket event has a Zod-defined payload in `events.contract.ts`.
4. Every queue job has a Zod payload schema and idempotency strategy.
5. Every external call is wrapped with timeout + retry + circuit breaker.
6. Every error path is covered by a typed `AppError` subclass.
7. Every new metric/log field is added to the dashboards or excluded with rationale.
8. The module is documented in `docs/modules/<name>.md` with a sequence diagram for its primary flow.

Anything less is incomplete, regardless of whether the happy path works.
