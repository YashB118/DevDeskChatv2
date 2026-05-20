import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { CacheService } from './cache.service';
import { type DistributedLockService, type LockHandle } from './distributed-lock.service';
import { type RedisClient } from './redis.provider';

function buildRedis(): {
  redis: RedisClient;
  store: Map<string, string>;
} {
  const store = new Map<string, string>();
  const redis = {
    get: vi.fn(async (k: string): Promise<string | null> => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string): Promise<'OK'> => {
      store.set(k, v);
      return 'OK';
    }),
    del: vi.fn(async (k: string): Promise<number> => {
      const had = store.delete(k);
      return had ? 1 : 0;
    }),
  } as unknown as RedisClient;
  return { redis, store };
}

function buildLocks(acquireResult: LockHandle | null): {
  locks: DistributedLockService;
  release: ReturnType<typeof vi.fn>;
} {
  const release = vi.fn().mockResolvedValue(true);
  const handle: LockHandle | null =
    acquireResult === null
      ? null
      : { ...acquireResult, release, extend: vi.fn().mockResolvedValue(true) };
  const locks = {
    acquire: vi.fn().mockResolvedValue(handle),
  } as unknown as DistributedLockService;
  return { locks, release };
}

const Schema = z.object({ value: z.number() });

describe('CacheService', () => {
  let redisCtx: ReturnType<typeof buildRedis>;
  beforeEach(() => {
    redisCtx = buildRedis();
  });

  it('returns parsed value from cache hit', async () => {
    redisCtx.store.set('k', JSON.stringify({ value: 7 }));
    const { locks } = buildLocks({ key: 'lock:k', token: 't' } as LockHandle);
    const svc = new CacheService(redisCtx.redis, locks);
    const out = await svc.get('k', Schema);
    expect(out).toEqual({ value: 7 });
  });

  it('returns null and evicts on schema mismatch', async () => {
    redisCtx.store.set('k', JSON.stringify({ value: 'wrong' }));
    const { locks } = buildLocks({ key: 'lock:k', token: 't' } as LockHandle);
    const svc = new CacheService(redisCtx.redis, locks);
    const out = await svc.get('k', Schema);
    expect(out).toBeNull();
    expect(redisCtx.redis.del).toHaveBeenCalledWith('k');
  });

  it('wrap calls loader once when cache misses and stores result', async () => {
    const { locks } = buildLocks({ key: 'lock:k', token: 't' } as LockHandle);
    const svc = new CacheService(redisCtx.redis, locks);
    const loader = vi.fn().mockResolvedValue({ value: 9 });
    const result = await svc.wrap('k', loader, { ttlSeconds: 10, schema: Schema });
    expect(result).toEqual({ value: 9 });
    expect(loader).toHaveBeenCalledOnce();
    expect(redisCtx.store.get('k')).toBe(JSON.stringify({ value: 9 }));
  });

  it('wrap falls back to loader when lock cannot be acquired', async () => {
    const { locks } = buildLocks(null);
    const svc = new CacheService(redisCtx.redis, locks);
    const loader = vi.fn().mockResolvedValue({ value: 4 });
    const result = await svc.wrap('k', loader, { ttlSeconds: 10, schema: Schema });
    expect(result).toEqual({ value: 4 });
    expect(loader).toHaveBeenCalledOnce();
  });

  it('wrap returns cached value without invoking loader when fresh entry exists', async () => {
    const { locks } = buildLocks({ key: 'lock:k', token: 't' } as LockHandle);
    const svc = new CacheService(redisCtx.redis, locks);
    redisCtx.store.set('k', JSON.stringify({ value: 11 }));
    const loader = vi.fn();
    const result = await svc.wrap('k', loader, { ttlSeconds: 10, schema: Schema });
    expect(result).toEqual({ value: 11 });
    expect(loader).not.toHaveBeenCalled();
    expect(locks.acquire).not.toHaveBeenCalled();
  });

  it('wrap propagates loader errors and releases the lock', async () => {
    const release = vi.fn().mockResolvedValue(true);
    const handle: LockHandle = {
      key: 'lock:k',
      token: 't',
      release,
      extend: vi.fn().mockResolvedValue(true),
    };
    const locks = {
      acquire: vi.fn().mockResolvedValue(handle),
    } as unknown as DistributedLockService;
    const svc = new CacheService(redisCtx.redis, locks);
    const boom = new Error('loader-failed');
    await expect(
      svc.wrap('k', async () => Promise.reject(boom), { ttlSeconds: 10, schema: Schema }),
    ).rejects.toBe(boom);
    expect(release).toHaveBeenCalledOnce();
  });
});
