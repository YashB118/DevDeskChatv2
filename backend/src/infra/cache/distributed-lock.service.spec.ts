import { describe, expect, it, vi } from 'vitest';
import { DistributedLockService } from './distributed-lock.service';
import { type RedisClient } from './redis.provider';

function buildRedis(): {
  redis: RedisClient;
  store: Map<string, string>;
  set: ReturnType<typeof vi.fn>;
  evalFn: ReturnType<typeof vi.fn>;
} {
  const store = new Map<string, string>();
  const set = vi.fn(
    async (k: string, v: string, _px: 'PX', _ttl: number, mode: 'NX'): Promise<'OK' | null> => {
      if (mode === 'NX' && store.has(k)) return null;
      store.set(k, v);
      return 'OK';
    },
  );
  const evalFn = vi.fn(async (_script: string, _n: number, key: string, token: string) => {
    if (store.get(key) === token) {
      store.delete(key);
      return 1;
    }
    return 0;
  });
  const redis = { set, eval: evalFn } as unknown as RedisClient;
  return { redis, store, set, evalFn };
}

describe('DistributedLockService', () => {
  it('acquires on first try and releases', async () => {
    const { redis, store } = buildRedis();
    const svc = new DistributedLockService(redis);
    const handle = await svc.acquire('k', { ttlMs: 1000 });
    expect(handle).not.toBeNull();
    expect(store.has('k')).toBe(true);
    const released = await handle!.release();
    expect(released).toBe(true);
    expect(store.has('k')).toBe(false);
  });

  it('returns null when key is held and retries are exhausted', async () => {
    const { redis, store } = buildRedis();
    store.set('k', 'other-token');
    const svc = new DistributedLockService(redis);
    const handle = await svc.acquire('k', { ttlMs: 1000, retries: 2, retryDelayMs: 1 });
    expect(handle).toBeNull();
  });

  it('with() releases the lock even when the callback throws', async () => {
    const { redis, store } = buildRedis();
    const svc = new DistributedLockService(redis);
    await expect(
      svc.with('k', { ttlMs: 1000 }, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(store.has('k')).toBe(false);
  });

  it('release returns false for an expired lock', async () => {
    const { redis } = buildRedis();
    const svc = new DistributedLockService(redis);
    const handle = await svc.acquire('k', { ttlMs: 1000 });
    expect(handle).not.toBeNull();
    await handle!.release();
    const second = await handle!.release();
    expect(second).toBe(false);
  });
});
