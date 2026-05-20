# Module — Health

> Exposes the liveness and readiness probes that orchestrators (Docker health checks, Kubernetes probes, load balancers) hit to decide whether the process is up and able to serve traffic.

**Files**
- `src/infra/health/health.module.ts`
- `src/infra/health/health.controller.ts`
- `src/infra/health/redis.indicator.ts`

The module lives under `src/infra/` rather than `src/modules/` because it is infrastructure-facing, not domain-facing. The same folder also holds the database and cache modules.

---

## 1. Responsibility

- Provide `GET /health/live` — liveness probe (process up).
- Provide `GET /health/ready` — readiness probe (Postgres + Redis reachable) via `@nestjs/terminus`.
- Return responses that are deterministic, allocation-light, and safe to hit dozens of times per minute.

## 2. Endpoints

### `GET /health/live`

- Returns HTTP 200 with `{ status: "ok", uptimeSeconds, timestamp }`.
- Liveness means *the process is alive*. As long as the event loop is running, this returns 200.
- Orchestrators that get a non-200 here should restart the container.
- Synchronous — no DB/Redis calls. Safe to keep firing during graceful shutdown.

```
{
  "status": "ok",
  "uptimeSeconds": <integer process uptime>,
  "timestamp": "<ISO-8601 UTC string>"
}
```

### `GET /health/ready`

- Driven by `HealthCheckService.check([...])` from `@nestjs/terminus`.
- Runs two probes:
  - `TypeOrmHealthIndicator.pingCheck('database', { timeout: 2000 })` — issues a real `SELECT 1`.
  - `RedisHealthIndicator.pingCheck('redis')` — issues a real `PING` and asserts the reply.
- Returns HTTP 200 when both succeed and 503 when either fails.
- Response payload follows the upstream terminus shape:

```
{
  "status": "ok" | "error",
  "info":  { "database": { "status": "up" }, "redis": { "status": "up", "status": "PONG" } },
  "error": { "redis":    { "status": "down", "message": "..." } },   // only on failure
  "details": {/* union of info + error */}
}
```

Clients that already rely on the `{ status: "ok", ... }` liveness shape must hit `/health/live` for that, not `/health/ready`. The two endpoints have intentionally different response contracts because they serve different orchestrator concerns.

## 3. `RedisHealthIndicator`

Custom indicator under `src/infra/health/redis.indicator.ts` because `@nestjs/terminus` ships no Redis indicator that targets `ioredis`. It:

- Injects the shared `REDIS_CLIENT` from `CacheModule`.
- Calls `redis.ping()` and returns `this.getStatus(key, true, { status: pong })`.
- On any throw, wraps with `HealthCheckError('Redis ping failed', { [key]: { status: 'down', message } })` so terminus reports a structured failure.

The indicator must not open new connections; it always reuses the global ioredis client so the readiness signal reflects the real production pool.

## 4. Logging

`LoggerModule` configures `pino-http` to skip auto-logging for both health URLs. This keeps high-frequency probes from drowning out real traffic in the log stream. If you change the path of a probe, update the ignore list in `src/config/logger.module.ts` accordingly.

## 5. Security

These endpoints are intentionally public. They reveal nothing more than the fact that the process is running and whether downstream infra is reachable. Do **not**:

- Include the application version, the git SHA, or environment details — that is a separate `/version` endpoint when needed.
- Include database or Redis URIs, error stacks, or driver-level diagnostics.
- Include any user-derived data.

Indicator names stay generic (`database`, `redis`) so the body never leaks topology.

## 6. Tests

`test/health.e2e-spec.ts` boots a minimal Nest application (`ConfigModule + LoggerModule + CorrelationMiddleware + a liveness-only controller`) and exercises:

- `GET /health/live` returns 200 and the expected shape.
- An unknown path returns the normalised 404 envelope with a generated `correlationId`.

The minimal-module approach avoids spinning up TypeORM + ioredis during unit-style test runs. Readiness coverage (terminus indicators wired against real Postgres + Redis) lands alongside the first domain module's Testcontainers harness in Phase 3.

## 7. Conventions for editors

- Keep `/health/live` branchless and synchronous.
- `/health/ready` must keep using the shared `REDIS_CLIENT` and `TypeOrmHealthIndicator` — never spin up ad-hoc connections.
- Do not gate the endpoints behind authentication. Probes run without credentials.
- Do not log inside the handler.
- Failure responses from terminus already follow a stable shape — do not wrap them in the project's `{ error: {...} }` envelope.

## 8. Future evolution

- Add a third indicator (e.g. for BullMQ Redis if it ends up on a separate instance, or for WAHA reachability) when Phase 6 lands.
- Phase 11 may add a dedicated `/version` endpoint that returns the git SHA and build timestamp. That endpoint lives next to the health controller but in a separate file to keep responsibilities clear.
- A monthly partition job for `audit_log` (Phase 3) is **not** colocated here — it has its own scheduling story.
