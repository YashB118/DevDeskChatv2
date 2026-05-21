import { describe, expect, it, vi } from 'vitest';
import { type ExecutionContext, type CallHandler } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { type AppConfig } from '@app/config/env';
import { RateLimitedError } from '@app/shared/errors';
import { GlobalRateLimitInterceptor } from './global-rate-limit.interceptor';
import { type RateLimitService } from './rate-limit.service';

function ctxFor(
  req: { ip?: string; user?: { id: string } },
  res: { setHeader: ReturnType<typeof vi.fn> },
): ExecutionContext {
  return {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

function env(over: Partial<AppConfig> = {}): AppConfig {
  return {
    RATE_LIMIT_ENABLED: true,
    RATE_LIMIT_IP_WINDOW_SECONDS: 60,
    RATE_LIMIT_IP_MAX: 600,
    RATE_LIMIT_USER_WINDOW_SECONDS: 60,
    RATE_LIMIT_USER_MAX: 300,
    ...over,
  } as AppConfig;
}

describe('GlobalRateLimitInterceptor', () => {
  it('limits by IP when no user is on the request', async () => {
    const consume = vi.fn().mockResolvedValueOnce({
      limited: false,
      count: 1,
      retryAfterSeconds: 0,
      resetAt: 0,
    });
    const limiter = { consume } as unknown as RateLimitService;
    const res = { setHeader: vi.fn() };
    const i = new GlobalRateLimitInterceptor(limiter, env());
    await firstValueFrom(
      await i.intercept(ctxFor({ ip: '1.2.3.4' }, res), {
        handle: () => of('ok'),
      } as CallHandler),
    );
    expect(consume).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledWith(expect.objectContaining({ key: 'rl:ip:1.2.3.4' }));
  });

  it('runs both IP and per-user limits when authenticated', async () => {
    const consume = vi
      .fn()
      .mockResolvedValueOnce({ limited: false, count: 1, retryAfterSeconds: 0, resetAt: 0 })
      .mockResolvedValueOnce({ limited: false, count: 1, retryAfterSeconds: 0, resetAt: 0 });
    const limiter = { consume } as unknown as RateLimitService;
    const res = { setHeader: vi.fn() };
    const i = new GlobalRateLimitInterceptor(limiter, env());
    await firstValueFrom(
      await i.intercept(ctxFor({ ip: '1.2.3.4', user: { id: 'u-1' } }, res), {
        handle: () => of('ok'),
      } as CallHandler),
    );
    expect(consume).toHaveBeenNthCalledWith(1, expect.objectContaining({ key: 'rl:ip:1.2.3.4' }));
    expect(consume).toHaveBeenNthCalledWith(2, expect.objectContaining({ key: 'rl:user:u-1' }));
  });

  it('throws RateLimitedError with Retry-After when the IP layer fires', async () => {
    const consume = vi.fn().mockResolvedValueOnce({
      limited: true,
      count: 600,
      retryAfterSeconds: 42,
      resetAt: 0,
    });
    const limiter = { consume } as unknown as RateLimitService;
    const res = { setHeader: vi.fn() };
    const i = new GlobalRateLimitInterceptor(limiter, env());
    await expect(
      i.intercept(ctxFor({ ip: '9.9.9.9' }, res), { handle: () => of('ok') } as CallHandler),
    ).rejects.toBeInstanceOf(RateLimitedError);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '42');
  });

  it('skips entirely when RATE_LIMIT_ENABLED is false', async () => {
    const consume = vi.fn();
    const limiter = { consume } as unknown as RateLimitService;
    const i = new GlobalRateLimitInterceptor(limiter, env({ RATE_LIMIT_ENABLED: false }));
    const out = await firstValueFrom(
      await i.intercept(ctxFor({ ip: '1.1.1.1', user: { id: 'u-1' } }, { setHeader: vi.fn() }), {
        handle: () => of('through'),
      } as CallHandler),
    );
    expect(out).toBe('through');
    expect(consume).not.toHaveBeenCalled();
  });
});
