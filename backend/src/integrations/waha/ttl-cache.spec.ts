import { describe, expect, it } from 'vitest';
import { TtlCache } from './ttl-cache';

describe('TtlCache', () => {
  it('returns the cached value within TTL', () => {
    let now = 1000;
    const cache = new TtlCache<string>(500, () => now);
    cache.set('k', 'v');
    now = 1200;
    expect(cache.get('k')).toBe('v');
  });

  it('expires after TTL', () => {
    let now = 0;
    const cache = new TtlCache<string>(500, () => now);
    cache.set('k', 'v');
    now = 501;
    expect(cache.get('k')).toBeUndefined();
  });

  it('treats ttl=0 as cache disabled', () => {
    const cache = new TtlCache<string>(0);
    cache.set('k', 'v');
    expect(cache.get('k')).toBeUndefined();
  });

  it('runs the loader exactly once under concurrent wrap calls (stampede)', async () => {
    let calls = 0;
    const cache = new TtlCache<number>(1000);
    const loader = async (): Promise<number> => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 42;
    };
    const [a, b, c] = await Promise.all([
      cache.wrap('k', loader),
      cache.wrap('k', loader),
      cache.wrap('k', loader),
    ]);
    expect([a, b, c]).toEqual([42, 42, 42]);
    expect(calls).toBe(1);
  });

  it('invalidate removes a key', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('k', 'v');
    cache.invalidate('k');
    expect(cache.get('k')).toBeUndefined();
  });
});
