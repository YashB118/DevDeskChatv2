# Module — Cache

> Redis client lifecycle, namespaced cache reads, and the distributed lock primitive used for stampede prevention and cross-replica coordination.

**Files**
- `src/infra/cache/cache.module.ts` — `@Global()` Nest module; owns `OnApplicationShutdown`.
- `src/infra/cache/redis.provider.ts` — `ioredis` factory provider, retry strategy, ready/reconnect logs.
- `src/infra/cache/cache.service.ts` — `get/set/del/wrap` with Zod-validated reads.
- `src/infra/cache/distributed-lock.service.ts` — `SET NX PX` + Lua release/extend.
- `src/infra/cache/constants.ts` — DI token (`REDIS_CLIENT`).

---

## 1. Responsibility

- Open and lifecycle the single `ioredis` client used by every Redis consumer (CacheService, DistributedLockService, RedisHealthIndicator, future Socket.IO Redis adapter and BullMQ connection).
- Provide a typed cache surface that Zod-validates payloads on read.
- Provide a distributed lock primitive with token-safe release semantics.
- Quit the client cleanly on SIGTERM via `OnApplicationShutdown`.

## 2. `RedisClient` provider

`redisProvider` is a `FactoryProvider<RedisClient>` keyed by the `REDIS_CLIENT` DI token. It:

- Reads `REDIS_URL` and `REDIS_KEY_PREFIX` from `APP_CONFIG`.
- Constructs `new Redis(REDIS_URL, { keyPrefix, maxRetriesPerRequest: 3, enableReadyCheck: true, lazyConnect: false, retryStrategy })`.
- `retryStrategy` is exponential, capped at 30s (`Math.min(1000 * 2 ** Math.min(attempt, 6), 30_000)`).
- Logs `ready`, `reconnecting`, and `error` events via a NestJS `Logger`.

The client is **shared across the process** — every consumer injects the same instance. Do not construct ad-hoc `new Redis(...)` clients; the Phase 4 Socket.IO adapter and Phase 5 BullMQ workers will `.duplicate()` from this single base.

The `keyPrefix` means every key passed to `client.get(...)` / `client.set(...)` is silently prefixed with `devdesk:` (default). **Lua scripts (`EVAL`) see un-prefixed keys**, so the distributed-lock script intentionally does not include the prefix in its `KEYS[1]` argument — beware of this when writing new Lua.

## 3. `CacheModule`

- `@Global()` so any module can inject `REDIS_CLIENT`, `CacheService`, or `DistributedLockService` without explicit import.
- Implements `OnApplicationShutdown`. On SIGTERM it resolves the client via `ModuleRef.get(REDIS_CLIENT, { strict: false })` and calls `redis.quit()`. If `quit()` throws (e.g., connection already gone), it logs and forces `disconnect()` so the process can exit.
- `app.enableShutdownHooks()` in `main.ts` is what triggers this hook — do not remove the call.

## 4. `CacheService`

Typed cache with three primitive ops and one composite:

### `get<T>(key, schema): Promise<T | null>`

- `GET key`. Returns `null` on miss.
- `JSON.parse` + `schema.safeParse`. On parse failure or schema failure: logs a warning, evicts the key, returns `null`. This protects callers from poisoned cache entries left over from previous deploys with a different shape.

### `set(key, value, ttlSeconds): Promise<void>`

- `SET key JSON.stringify(value) EX ttlSeconds`. `value` is `unknown` — the schema lives on the read side.

### `del(key): Promise<void>`

- `DEL key`. Fire-and-forget semantics for the caller.

### `wrap<T>(key, loader, opts): Promise<T>`

- Reads with `get(key, opts.schema)`. Cache hit → return.
- Phase 10: every call increments `cache_lookups_total{namespace, outcome}` where `namespace` is the first colon-segment of the key (`chats:list:<id>` → `chats`) and `outcome` is `hit` or `miss`. Keep that segment stable so the Prom labels stay bounded.
- Miss → acquire `lock:<key>` via `DistributedLockService.acquire({ ttlMs: opts.lockTtlMs ?? 5000, retries: opts.lockRetries ?? 20, retryDelayMs: opts.lockRetryDelayMs ?? 50 })`.
- If the lock cannot be acquired within the retry budget → log a warning and call `loader()` *without* exclusivity (degraded mode — better to serve the request than to fail it).
- With the lock held: re-check the cache, then call `loader()`, then `set(key, value, opts.ttlSeconds)` before releasing the lock. The re-check protects against the (legitimate) winner having populated the cache while we waited.
- `loader` errors propagate out — the lock is released in a `finally`.

Always provide a Zod schema:

```ts
const ChatSummarySchema = z.object({ id: z.string(), name: z.string() });
const chats = await cache.wrap(`chats:user:${userId}`, () => repo.list(userId), {
  ttlSeconds: 10,
  schema: z.array(ChatSummarySchema),
});
```

### Key conventions

- Namespace with colons: `chats:user:<id>`, `sessions:status:<sessionId>`, `users:by-email:<email>`.
- Keep TTLs short for read-through caches of mutable data (≤30s). Use longer TTLs for things derived from immutable inputs.
- The `devdesk:` prefix is added automatically by ioredis — do not include it in code.

## 5. `DistributedLockService`

Built on `SET NX PX` plus a Lua release script. Every `acquire` mints a random 32-char hex token; release / extend require that same token, so a holder cannot accidentally release another holder's lock that took over after expiry.

### `acquire(key, opts): Promise<LockHandle | null>`

- Sends `SET key <token> PX <ttlMs> NX`.
- On `OK` → returns a `LockHandle { key, token, release(), extend(ttlMs) }`.
- On `null` (held by someone else) → optionally retries `opts.retries` times with `opts.retryDelayMs` between attempts (default `0` retries / `50ms` delay).
- Returns `null` after the retry budget. Callers decide whether that is fatal (CacheService treats it as degraded mode; other call sites should treat it as `ConflictError`).

### `with<T>(key, opts, fn): Promise<T>`

- Acquires (throws `Error('Could not acquire lock for ...')` if it cannot).
- Runs the callback.
- Releases in a `finally`. If release reports `false` (lock already expired), logs a warning.

### Release / extend safety

The Lua script is:

```
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
```

(Extend uses the same compare-and-set pattern with `PEXPIRE`.) Both scripts are submitted via `EVAL` on every call — the Phase 11 work may move them to `SCRIPT LOAD` + `EVALSHA` if hot-path overhead is measurable.

### Usage

```ts
await locks.with(`sync:user:${userId}`, { ttlMs: 5000, retries: 10, retryDelayMs: 100 }, async () => {
  await mutator();
});
```

Lock keys live in the same namespace as cache keys (`devdesk:lock:<...>`) so a single Redis instance hosts both.

## 6. Lifecycle

```
Nest bootstrap
   → CacheModule providers instantiate
      → redisProvider runs `new Redis(...)`
      → client emits `ready` once handshake completes
TypeORM ready + Redis ready
   → /health/ready flips to "ok"
SIGTERM
   → app.enableShutdownHooks fires CacheModule.onApplicationShutdown
   → redis.quit() drains commands then closes
   → process exits with 0
```

## 7. Tests

Unit tests use in-memory fakes — no Docker required.

- `cache.service.spec.ts` — cache hit, schema-mismatch eviction, miss → loader + set, lock-contention fallback to loader, fresh-entry shortcut without acquiring the lock, loader error propagation with lock released.
- `distributed-lock.service.spec.ts` — acquire on first try + release, retries exhausted → `null`, `with()` releases on throw, release returns `false` for an expired (and already released) lock.

Live-Redis integration tests land alongside the first domain module in Phase 3.

## 8. Common editing mistakes

| Mistake | Correct pattern |
| --- | --- |
| Constructing a fresh `new Redis(...)` per service. | Inject the shared `REDIS_CLIENT`. If a duplicated connection is needed (BullMQ workers, Socket.IO adapter), call `redis.duplicate()` from the shared client. |
| Caching unvalidated payloads. | Always pass a Zod schema to `get`/`wrap`. The schema is contract enforcement, not a nicety. |
| Holding a lock across an unbounded loader. | Set `ttlMs` to a realistic upper bound and use `extend(...)` for long-running work. Otherwise a stuck loader blocks everyone. |
| Forgetting `await` on `release()`. | The lock is released asynchronously; missing `await` can let SIGTERM kill the process mid-release and leak the key. |
| Including the `devdesk:` prefix in code. | ioredis adds the prefix automatically. Including it twice corrupts keys (`devdesk:devdesk:...`). |
| Hand-writing release Lua. | Use `DistributedLockService` — the token compare-and-set semantics are the whole point. |

## 9. Future evolution

- Phase 4 wires the Socket.IO Redis adapter via `redis.duplicate()` from the shared client.
- Phase 5 wires BullMQ queues + workers from the same base connection (`connection: redis.duplicate()` per queue/worker).
- Phase 11 may introduce a sharded `RedisModule` if traffic warrants — the API surface (CacheService / DistributedLockService) stays the same; only the provider changes.
- A second cache tier (in-process LRU in front of Redis) is **not** planned; if it becomes necessary, build it as a wrapper around `CacheService` rather than replacing it.
