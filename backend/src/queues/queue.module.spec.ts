import { describe, expect, it } from 'vitest';
import { type AppConfig } from '@app/config/env';
import { buildQueueOptions } from './queue.module';

function baseEnv(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    REDIS_URL: 'redis://localhost:6379/0',
    QUEUE_PREFIX: 'devdesk-bull',
    QUEUE_DEFAULT_ATTEMPTS: 5,
    QUEUE_DEFAULT_BACKOFF_MS: 1000,
    QUEUE_REMOVE_ON_COMPLETE: 1000,
    QUEUE_REMOVE_ON_FAIL: 5000,
    ...overrides,
  } as AppConfig;
}

describe('buildQueueOptions', () => {
  it('parses host/port/db from REDIS_URL', () => {
    const opts = buildQueueOptions(baseEnv({ REDIS_URL: 'redis://localhost:6379/3' }));
    const conn = opts.connection as { host: string; port: number; db: number };
    expect(conn.host).toBe('localhost');
    expect(conn.port).toBe(6379);
    expect(conn.db).toBe(3);
  });

  it('forces maxRetriesPerRequest to null so workers can run blocking commands', () => {
    const opts = buildQueueOptions(baseEnv());
    const conn = opts.connection as { maxRetriesPerRequest: number | null };
    expect(conn.maxRetriesPerRequest).toBeNull();
  });

  it('decodes credentials from the URL when present', () => {
    const opts = buildQueueOptions(baseEnv({ REDIS_URL: 'redis://user%40x:p%2Fass@redis:6380/1' }));
    const conn = opts.connection as { username?: string; password?: string; port: number };
    expect(conn.username).toBe('user@x');
    expect(conn.password).toBe('p/ass');
    expect(conn.port).toBe(6380);
  });

  it('applies prefix and defaultJobOptions from env', () => {
    const opts = buildQueueOptions(
      baseEnv({
        QUEUE_PREFIX: 'custom-prefix',
        QUEUE_DEFAULT_ATTEMPTS: 7,
        QUEUE_DEFAULT_BACKOFF_MS: 2500,
        QUEUE_REMOVE_ON_COMPLETE: 50,
        QUEUE_REMOVE_ON_FAIL: 100,
      }),
    );
    expect(opts.prefix).toBe('custom-prefix');
    expect(opts.defaultJobOptions).toEqual({
      attempts: 7,
      backoff: { type: 'exponential', delay: 2500 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    });
  });
});
