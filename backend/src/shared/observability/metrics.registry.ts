import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Single Prometheus registry shared across the app. Default Node process
 * metrics (event loop lag, GC, memory, file descriptors) are collected
 * automatically — instance-specific gauges are registered on top.
 */

export const metricsRegistry = new Registry();
collectDefaultMetrics({ register: metricsRegistry });

const labelNames = (...names: string[]): string[] => names;

// HTTP — recorded by `MetricsInterceptor`.
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: labelNames('method', 'route', 'status'),
  // Buckets cover sub-ms responses (cache hits) through slow upstream-bound
  // requests. The 5s bucket aligns with the Postgres statement timeout.
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [metricsRegistry],
});

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'HTTP request count, partitioned by route and status',
  labelNames: labelNames('method', 'route', 'status'),
  registers: [metricsRegistry],
});

// Sockets — emitted/received counts via SocketEmitter.
export const socketEventsEmittedTotal = new Counter({
  name: 'socket_events_emitted_total',
  help: 'Outbound Socket.IO events emitted',
  labelNames: labelNames('event', 'room_kind'),
  registers: [metricsRegistry],
});

export const activeSocketConnections = new Gauge({
  name: 'active_socket_connections',
  help: 'Currently connected websocket clients',
  registers: [metricsRegistry],
});

// Queues — wired by `WorkerHarness`.
export const queueJobDuration = new Histogram({
  name: 'queue_job_duration_seconds',
  help: 'BullMQ job processing duration',
  labelNames: labelNames('queue', 'jobName', 'outcome'),
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [metricsRegistry],
});

export const queueJobsTotal = new Counter({
  name: 'queue_jobs_total',
  help: 'BullMQ job outcomes',
  labelNames: labelNames('queue', 'jobName', 'outcome'),
  registers: [metricsRegistry],
});

// WAHA outbound — wired by `WahaService`.
export const wahaRequestDuration = new Histogram({
  name: 'waha_request_duration_seconds',
  help: 'Outbound WAHA HTTP duration',
  labelNames: labelNames('method', 'outcome'),
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [metricsRegistry],
});

export const wahaRequestsTotal = new Counter({
  name: 'waha_requests_total',
  help: 'Outbound WAHA HTTP attempts',
  labelNames: labelNames('method', 'outcome'),
  registers: [metricsRegistry],
});

export const wahaCircuitState = new Gauge({
  name: 'waha_circuit_state',
  help: 'WAHA circuit breaker state: 0=closed, 1=half_open, 2=open',
  labelNames: labelNames('method'),
  registers: [metricsRegistry],
});

// Cache — wired by `CacheService`.
export const cacheLookupsTotal = new Counter({
  name: 'cache_lookups_total',
  help: 'CacheService.wrap outcomes',
  labelNames: labelNames('namespace', 'outcome'),
  registers: [metricsRegistry],
});

// Postgres pool — sampled via `PostgresPoolCollector`.
export const pgPoolActive = new Gauge({
  name: 'postgres_pool_active_connections',
  help: 'Postgres connections currently checked out of the pool',
  registers: [metricsRegistry],
});
export const pgPoolIdle = new Gauge({
  name: 'postgres_pool_idle_connections',
  help: 'Postgres connections currently idle in the pool',
  registers: [metricsRegistry],
});
export const pgPoolWaiting = new Gauge({
  name: 'postgres_pool_waiting_clients',
  help: 'Callers waiting for a Postgres pool checkout',
  registers: [metricsRegistry],
});

export const METRIC_OUTCOME = {
  SUCCESS: 'success',
  FAILURE: 'failure',
  TIMEOUT: 'timeout',
  RETRY: 'retry',
  CACHE_HIT: 'hit',
  CACHE_MISS: 'miss',
} as const;

export type MetricOutcome = (typeof METRIC_OUTCOME)[keyof typeof METRIC_OUTCOME];

export function roomKindFor(room: string): 'user' | 'chat' | 'admin' | 'socket' | 'other' {
  if (room.startsWith('user:')) return 'user';
  if (room.startsWith('chat:')) return 'chat';
  if (room === 'admin') return 'admin';
  // Socket-id targeted emits don't carry a prefix; treat as a separate bucket.
  if (/^[A-Za-z0-9_-]+$/.test(room) && room.length <= 24) return 'socket';
  return 'other';
}
