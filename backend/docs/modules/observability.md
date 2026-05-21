# Module — Observability (Phase 10)

> Metrics, traces, and broadened health probes. Wires `prom-client` and `@opentelemetry/sdk-node` onto the existing logging + audit baseline. No public surface beyond `/metrics` (token-gated) — every other piece is internal instrumentation.

**Files**
- `src/config/telemetry.ts` — `startTelemetry()`, called at the top of `main.ts` before any other application import so OTel auto-instrumentation can patch `express`, `pg`, `ioredis`, `axios`, and `bullmq` before NestJS resolves them. Exposes `getTracer()` (used by `@TraceMethod`) and the SDK shutdown handle.
- `src/shared/observability/metrics.module.ts` — `@Global()` Nest module wrapping `MetricsController`, `MetricsInterceptor`, `PostgresPoolCollector`.
- `src/shared/observability/metrics.registry.ts` — single `prom-client` `Registry`, `collectDefaultMetrics`, all custom counters / histograms / gauges, plus `roomKindFor()` + `METRIC_OUTCOME` enum.
- `src/shared/observability/metrics.controller.ts` — `GET /metrics` (`@Public()`, bearer-token gated).
- `src/shared/observability/metrics.interceptor.ts` — global HTTP interceptor; records `http_request_duration_seconds` + `http_requests_total` using the matched route pattern.
- `src/shared/observability/postgres-pool.collector.ts` — `OnApplicationBootstrap` + `OnApplicationShutdown`; samples pg pool counters every 5s.
- `src/shared/observability/trace-method.decorator.ts` — `@TraceMethod()` for custom OTel spans on service methods.
- `src/infra/health/waha.indicator.ts` — terminus probe with TTL cache + timeout race for WAHA reachability.

---

## 1. OTel bootstrap (`config/telemetry.ts`)

```
main.ts
  ↓ startTelemetry()                       // before AppModule import
      ↓ if !OTEL_ENABLED → noop handle
      ↓ dynamic import of sdk-node + auto-instrumentations
      ↓ Resource(service.name, service.version)
      ↓ TraceIdRatioBasedSampler(OTEL_TRACES_SAMPLER_RATIO)
      ↓ OTLPTraceExporter(OTEL_EXPORTER_OTLP_ENDPOINT)
      ↓ sdk.start()
  ↓ NestFactory.create(AppModule)          // express + pg + ioredis already patched
  ...
  ↓ process.once('SIGTERM' | 'SIGINT') → telemetry.shutdown()
```

`getTracer()` resolves the application tracer (falls back to the global noop tracer when OTel is off), so `@TraceMethod` is always safe to apply.

## 2. Prometheus surface (`/metrics`)

Single registry; emitter labels keep cardinality bounded:

| Metric | Type | Labels | Source |
| --- | --- | --- | --- |
| `http_request_duration_seconds` | Histogram | method, route, status | `MetricsInterceptor` |
| `http_requests_total` | Counter | method, route, status | `MetricsInterceptor` |
| `socket_events_emitted_total` | Counter | event, room_kind | `SocketEmitter.emit` |
| `active_socket_connections` | Gauge | — | `RealtimeGateway.handleConnection/handleDisconnect` |
| `queue_job_duration_seconds` | Histogram | queue, jobName, outcome | `WorkerHarness.recordOutcome` |
| `queue_jobs_total` | Counter | queue, jobName, outcome | `WorkerHarness.recordOutcome` |
| `waha_request_duration_seconds` | Histogram | method, outcome | `WahaService.recordCall` |
| `waha_requests_total` | Counter | method, outcome | `WahaService.recordCall` |
| `waha_circuit_state` | Gauge | method | `WahaService.recordCall` (0=closed, 1=half-open, 2=open) |
| `cache_lookups_total` | Counter | namespace, outcome | `CacheService.wrap` (`hit` / `miss`) |
| `postgres_pool_active_connections` | Gauge | — | `PostgresPoolCollector` (5s tick) |
| `postgres_pool_idle_connections` | Gauge | — | `PostgresPoolCollector` |
| `postgres_pool_waiting_clients` | Gauge | — | `PostgresPoolCollector` |

Plus the `prom-client` default metrics (event loop lag, GC, memory, FDs).

`MetricsController` requires `Authorization: Bearer <METRICS_BEARER_TOKEN>` on every scrape. When the token env is unset the endpoint refuses every request — a fresh deploy never accidentally exposes counters before the scraper is configured.

## 3. HTTP route labelling

`MetricsInterceptor` reads the matched route pattern from `req.route.path` (Express attaches it once routing resolves) and joins it with `req.baseUrl`. When no pattern resolves (404, middleware-rejected) the route label is `'unmatched'`, never the raw URL — high-cardinality labels kill Prometheus storage. Errors short-circuit through the `rxjs` `tap.error` callback with the upstream status code (falls back to 500).

## 4. `@TraceMethod`

```ts
class ChatsService {
  @TraceMethod({ moduleHint: 'chats' })
  async list(user: UserDomain, q: ListChatsQuery): Promise<EnrichedChat[]> { ... }
}
```

Wraps the call in `tracer.startActiveSpan(name, fn)`. Errors are recorded on the span (`recordException` + `SpanStatusCode.ERROR`) and rethrown. Async returns chain through `.then(...)` so the span closes when the promise settles. Span name format: `<moduleHint?>.<ClassName>.<methodName>` (override with `name`).

## 5. Health probes (`/health/ready`)

`HealthController.ready` now calls three terminus indicators:

1. `TypeOrmHealthIndicator.pingCheck('database', { timeout: 2000 })` — `SELECT 1`.
2. `RedisHealthIndicator.pingCheck('redis')` — Redis `PING`.
3. `WahaHealthIndicator.pingCheck('waha')` — calls `WahaService.listSessions()` under a `HEALTH_WAHA_TIMEOUT_MS` race; the last result is cached for `HEALTH_WAHA_CACHE_TTL_MS` (failures also cached briefly so a flapping upstream doesn't melt the probe path).

## 6. Audit log coverage

Phase 10 broadens the `AuditEvent` union with `session.create`, `session.start`, `session.stop`, `session.delete`. `SessionsController` plumbs `@CurrentUser()` through so the audit row carries the acting admin. Combined with Phase 9's user / assignment / mute events the audit trail now spans every sensitive admin operation. See [auth.md](auth.md) §6 for the full list.

## 7. Env surface (`config.md`)

| Var | Default | Purpose |
| --- | --- | --- |
| `OTEL_ENABLED` | `false` | Master switch — off in unit tests / local dev. |
| `OTEL_SERVICE_NAME` | `devdeskchat-backend` | Resource attribute and tracer name. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | OTLP HTTP collector URL. SDK runs without an exporter when unset (spans dropped). |
| `OTEL_TRACES_SAMPLER_RATIO` | `1` | `TraceIdRatioBasedSampler` ratio. |
| `METRICS_BEARER_TOKEN` | unset | Required for `/metrics` to respond. |
| `HEALTH_WAHA_CACHE_TTL_MS` | `15000` | Cache window for the WAHA reachability probe result. |
| `HEALTH_WAHA_TIMEOUT_MS` | `2500` | Per-probe upper bound. |

## 8. Editing rules

- New metrics live in `metrics.registry.ts`; keep label cardinality low (avoid raw IDs, free-form strings).
- Never read `process.env` outside `env.ts` — `telemetry.ts` is the single exception because it must run before the env loader.
- Trace decorators should target service methods, not controllers (auto-instrumentation already covers HTTP).
- Any new sensitive admin operation must call `AuthRepository.writeAudit(event, actorId, payload?)` and extend `AuditEvent` in `auth.types.ts`.

## 9. Tests

- `metrics.registry.spec.ts` — registry exposes the documented metric set; `roomKindFor` classifies socket targets correctly.
- `metrics.interceptor.spec.ts` — success / 404 / error-status paths, non-http context bypass.
- `trace-method.decorator.spec.ts` — sync + async pass-through, error rethrow.

Live OTLP-collector + Prometheus-scraper integration coverage is deferred to Phase 12.
