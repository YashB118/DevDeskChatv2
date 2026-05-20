import { describe, expect, it, vi } from 'vitest';
import { PendingMessageStore } from './pending.store';
import { type AppConfig } from '@app/config/env';
import { type RedisClient } from '@app/infra/cache/redis.provider';
import { PENDING_MESSAGE_KEY_PREFIX } from './constants';

function fakeRedis(): {
  redis: RedisClient;
  set: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
} {
  const set = vi.fn(async () => 'OK');
  const exists = vi.fn(async () => 0);
  const del = vi.fn(async () => 0);
  const redis = { set, exists, del } as unknown as RedisClient;
  return { redis, set, exists, del };
}

describe('PendingMessageStore', () => {
  it('writes with PX TTL from env', async () => {
    const { redis, set } = fakeRedis();
    const store = new PendingMessageStore({ PENDING_MESSAGE_TTL_MS: 9000 } as AppConfig, redis);
    await store.add('stanza-1');
    expect(set).toHaveBeenCalledWith(`${PENDING_MESSAGE_KEY_PREFIX}stanza-1`, '1', 'PX', 9000);
  });

  it('allows per-call TTL override', async () => {
    const { redis, set } = fakeRedis();
    const store = new PendingMessageStore({ PENDING_MESSAGE_TTL_MS: 9000 } as AppConfig, redis);
    await store.add('stanza-2', 1234);
    expect(set).toHaveBeenCalledWith(expect.any(String), '1', 'PX', 1234);
  });

  it('isPending returns true only when redis reports the key exists', async () => {
    const { redis, exists } = fakeRedis();
    exists.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const store = new PendingMessageStore({ PENDING_MESSAGE_TTL_MS: 9000 } as AppConfig, redis);
    expect(await store.isPending('a')).toBe(true);
    expect(await store.isPending('a')).toBe(false);
  });

  it('resolve returns whether a key was actually deleted', async () => {
    const { redis, del } = fakeRedis();
    del.mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const store = new PendingMessageStore({ PENDING_MESSAGE_TTL_MS: 9000 } as AppConfig, redis);
    expect(await store.resolve('a')).toBe(true);
    expect(await store.resolve('b')).toBe(false);
  });
});
