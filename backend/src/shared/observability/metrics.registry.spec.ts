import { afterEach, describe, expect, it } from 'vitest';
import {
  cacheLookupsTotal,
  httpRequestDuration,
  httpRequestsTotal,
  METRIC_OUTCOME,
  metricsRegistry,
  queueJobDuration,
  queueJobsTotal,
  roomKindFor,
  socketEventsEmittedTotal,
  wahaCircuitState,
  wahaRequestDuration,
  wahaRequestsTotal,
} from './metrics.registry';

describe('metrics registry', () => {
  afterEach(() => {
    httpRequestDuration.reset();
    httpRequestsTotal.reset();
    socketEventsEmittedTotal.reset();
    cacheLookupsTotal.reset();
    queueJobDuration.reset();
    queueJobsTotal.reset();
    wahaRequestDuration.reset();
    wahaRequestsTotal.reset();
    wahaCircuitState.reset();
  });

  it('exposes the documented Prometheus metric set on a single registry', async () => {
    const text = await metricsRegistry.metrics();
    expect(text).toContain('http_request_duration_seconds');
    expect(text).toContain('http_requests_total');
    expect(text).toContain('socket_events_emitted_total');
    expect(text).toContain('active_socket_connections');
    expect(text).toContain('queue_job_duration_seconds');
    expect(text).toContain('queue_jobs_total');
    expect(text).toContain('waha_request_duration_seconds');
    expect(text).toContain('waha_circuit_state');
    expect(text).toContain('cache_lookups_total');
    expect(text).toContain('postgres_pool_active_connections');
    expect(text).toContain('postgres_pool_idle_connections');
    expect(text).toContain('postgres_pool_waiting_clients');
  });

  it('roomKindFor classifies socket targets', () => {
    expect(roomKindFor('user:abc')).toBe('user');
    expect(roomKindFor('chat:xyz')).toBe('chat');
    expect(roomKindFor('admin')).toBe('admin');
    expect(roomKindFor('Q123abc')).toBe('socket');
    expect(roomKindFor('some-long-and-weird-bucket-name-here')).toBe('other');
  });

  it('METRIC_OUTCOME exposes the canonical outcome strings used by call sites', () => {
    expect(METRIC_OUTCOME.SUCCESS).toBe('success');
    expect(METRIC_OUTCOME.FAILURE).toBe('failure');
    expect(METRIC_OUTCOME.CACHE_HIT).toBe('hit');
    expect(METRIC_OUTCOME.CACHE_MISS).toBe('miss');
  });
});
