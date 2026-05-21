import { describe, expect, it, vi } from 'vitest';
import { type RedisClient } from '@app/infra/cache/redis.provider';
import { RateLimitService } from './rate-limit.service';

interface Entry {
  score: number;
  member: string;
}

function buildRedis(): RedisClient {
  const zsets = new Map<string, Entry[]>();
  let cachedSha: string | null = null;
  const runScript = (
    key: string,
    now: number,
    windowMs: number,
    max: number,
    token: string,
  ): [number, number, number] => {
    const entries = (zsets.get(key) ?? []).filter((e) => e.score > now - windowMs);
    if (entries.length >= max) {
      const oldest = entries[0]?.score ?? now;
      zsets.set(key, entries);
      return [1, entries.length, oldest + windowMs];
    }
    entries.push({ score: now, member: token });
    zsets.set(key, entries);
    return [0, entries.length, now + windowMs];
  };

  const script = vi.fn(async (cmd: string, _payload: string): Promise<string> => {
    expect(cmd).toBe('LOAD');
    cachedSha = 'sha-test';
    return cachedSha;
  });

  const evalsha = vi.fn(
    async (
      _sha: string,
      _n: number,
      key: string,
      nowArg: string,
      windowArg: string,
      maxArg: string,
      token: string,
    ) => runScript(key, Number(nowArg), Number(windowArg), Number(maxArg), token),
  );

  const evalFn = vi.fn(
    async (
      _src: string,
      _n: number,
      key: string,
      nowArg: string,
      windowArg: string,
      maxArg: string,
      token: string,
    ) => runScript(key, Number(nowArg), Number(windowArg), Number(maxArg), token),
  );

  const del = vi.fn(async (key: string): Promise<number> => {
    zsets.delete(key);
    return 1;
  });

  return { script, evalsha, eval: evalFn, del } as unknown as RedisClient;
}

describe('RateLimitService', () => {
  it('allows requests under the cap, blocks at the cap, exposes retryAfter', async () => {
    const svc = new RateLimitService(buildRedis());
    const opts = { key: 'rl:test:user', windowSeconds: 60, max: 3 };
    for (let i = 0; i < 3; i++) {
      const res = await svc.consume(opts);
      expect(res.limited).toBe(false);
      expect(res.count).toBe(i + 1);
    }
    const blocked = await svc.consume(opts);
    expect(blocked.limited).toBe(true);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('refills the window after the oldest entry expires', async () => {
    const svc = new RateLimitService(buildRedis());
    const opts = { key: 'rl:test:slide', windowSeconds: 1, max: 2 };
    const realNow = Date.now.bind(Date);
    let clock = realNow();
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      await svc.consume(opts);
      await svc.consume(opts);
      const blocked = await svc.consume(opts);
      expect(blocked.limited).toBe(true);
      clock += 1100;
      const after = await svc.consume(opts);
      expect(after.limited).toBe(false);
    } finally {
      dateSpy.mockRestore();
    }
  });

  it('counts entries across distinct keys independently', async () => {
    const svc = new RateLimitService(buildRedis());
    const a = await svc.consume({ key: 'rl:test:a', windowSeconds: 60, max: 1 });
    const b = await svc.consume({ key: 'rl:test:b', windowSeconds: 60, max: 1 });
    expect(a.limited).toBe(false);
    expect(b.limited).toBe(false);
    const aSecond = await svc.consume({ key: 'rl:test:a', windowSeconds: 60, max: 1 });
    expect(aSecond.limited).toBe(true);
  });

  it('fails open when the Redis script crashes', async () => {
    const broken = {
      script: vi.fn().mockRejectedValue(new Error('connection refused')),
      evalsha: vi.fn().mockRejectedValue(new Error('connection refused')),
      eval: vi.fn().mockRejectedValue(new Error('connection refused')),
      del: vi.fn(),
    } as unknown as RedisClient;
    const svc = new RateLimitService(broken);
    const res = await svc.consume({ key: 'rl:test:fail-open', windowSeconds: 60, max: 1 });
    expect(res.limited).toBe(false);
  });
});
