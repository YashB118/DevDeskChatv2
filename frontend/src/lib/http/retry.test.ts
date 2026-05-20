import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  _resetRefreshState,
  isRefreshing,
  refreshAccessToken,
  registerRefreshHandler,
} from './retry';

describe('refresh queue', () => {
  afterEach(() => {
    _resetRefreshState();
  });

  it('coalesces concurrent callers behind a single in-flight promise', async () => {
    const handler = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return 'tok';
    });
    registerRefreshHandler(handler);

    const [a, b, c] = await Promise.all([
      refreshAccessToken(),
      refreshAccessToken(),
      refreshAccessToken(),
    ]);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(a).toBe('tok');
    expect(b).toBe('tok');
    expect(c).toBe('tok');
    expect(isRefreshing()).toBe(false);
  });

  it('allows a fresh refresh after one resolves', async () => {
    const handler = vi.fn(() => Promise.resolve('tok'));
    registerRefreshHandler(handler);

    await refreshAccessToken();
    await refreshAccessToken();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('rejects without a registered handler', async () => {
    await expect(refreshAccessToken()).rejects.toThrow('No refresh handler');
  });

  it('clears in-flight slot on rejection so retry is possible', async () => {
    let attempt = 0;
    registerRefreshHandler(() => {
      attempt += 1;
      if (attempt === 1) return Promise.reject(new Error('boom'));
      return Promise.resolve('tok');
    });

    await expect(refreshAccessToken()).rejects.toThrow('boom');
    expect(isRefreshing()).toBe(false);
    await expect(refreshAccessToken()).resolves.toBe('tok');
  });
});
