import { describe, expect, it, vi } from 'vitest';
import { Reflector } from '@nestjs/core';
import { type ExecutionContext, type CallHandler } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { z } from 'zod';
import { type AppConfig } from '@app/config/env';
import { type CacheService } from '@app/infra/cache/cache.service';
import { RateLimitedError } from '@app/shared/errors';
import { RouteRateLimitInterceptor } from './route-rate-limit.interceptor';
import { type RateLimitService } from './rate-limit.service';
import { RATE_LIMIT_META, type RateLimitDescriptor } from './rate-limit.types';

function buildCtx(descriptor: RateLimitDescriptor | undefined): {
  ctx: ExecutionContext;
  res: { setHeader: ReturnType<typeof vi.fn>; headers: Record<string, string> };
} {
  const headers: Record<string, string> = {};
  const res = {
    headers,
    setHeader: vi.fn((k: string, v: string) => {
      headers[k] = v;
    }),
  };
  const handler = (): void => {
    /* noop */
  };
  if (descriptor) Reflect.defineMetadata(RATE_LIMIT_META, descriptor, handler);
  const ctx = {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => class C {},
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: 'u-1' }, query: { session: 'default' } }),
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
  return { ctx, res };
}

function env(over: Partial<AppConfig> = {}): AppConfig {
  return {
    RATE_LIMIT_ENABLED: true,
    RATE_LIMIT_SEND_WINDOW_SECONDS: 10,
    RATE_LIMIT_SEND_MAX: 1,
    RATE_LIMIT_CHATS_WINDOW_SECONDS: 5,
    RATE_LIMIT_CHATS_MAX: 1,
    RATE_LIMIT_AUTH_WINDOW_SECONDS: 900,
    RATE_LIMIT_AUTH_MAX: 5,
    ...over,
  } as AppConfig;
}

describe('RouteRateLimitInterceptor', () => {
  it('passes through when there is no descriptor on the handler', async () => {
    const { ctx } = buildCtx(undefined);
    const limiter = { consume: vi.fn() } as unknown as RateLimitService;
    const cache = { get: vi.fn() } as unknown as CacheService;
    const i = new RouteRateLimitInterceptor(new Reflector(), limiter, cache, env());
    const next: CallHandler = { handle: () => of('ok') };
    const out = await firstValueFrom(await i.intercept(ctx, next));
    expect(out).toBe('ok');
    expect(limiter.consume).not.toHaveBeenCalled();
  });

  it('throws RateLimitedError with Retry-After in hard mode when the limit fires', async () => {
    const descriptor: RateLimitDescriptor = {
      preset: 'send',
      mode: 'hard',
      identify: () => 'u-1',
    };
    const { ctx, res } = buildCtx(descriptor);
    const limiter = {
      consume: vi.fn().mockResolvedValue({
        limited: true,
        count: 1,
        retryAfterSeconds: 7,
        resetAt: Date.now() + 7000,
      }),
    } as unknown as RateLimitService;
    const cache = { get: vi.fn() } as unknown as CacheService;
    const i = new RouteRateLimitInterceptor(new Reflector(), limiter, cache, env());
    const next: CallHandler = { handle: () => of('ok') };
    await expect(i.intercept(ctx, next)).rejects.toBeInstanceOf(RateLimitedError);
    expect(res.headers['Retry-After']).toBe('7');
    expect(res.headers['X-RateLimit-Limit']).toBe('1');
  });

  it('serves cached value with X-RateLimit-Cached on soft hit', async () => {
    const Schema = z.array(z.object({ id: z.string() }));
    const descriptor: RateLimitDescriptor = {
      preset: 'chats',
      mode: 'soft',
      identify: () => 'u-1',
      softCache: {
        key: () => 'chats:list:u-1:default:50:0',
        schema: Schema,
        wrap: (cached): { chats: unknown } => ({ chats: cached }),
      },
    };
    const { ctx, res } = buildCtx(descriptor);
    const cached = [{ id: 'a' }, { id: 'b' }];
    const limiter = {
      consume: vi
        .fn()
        .mockResolvedValue({ limited: true, count: 2, retryAfterSeconds: 1, resetAt: 0 }),
    } as unknown as RateLimitService;
    const cache = { get: vi.fn().mockResolvedValue(cached) } as unknown as CacheService;
    const i = new RouteRateLimitInterceptor(new Reflector(), limiter, cache, env());
    const next: CallHandler = { handle: () => of({ chats: ['fresh'] }) };
    const out = await firstValueFrom(await i.intercept(ctx, next));
    expect(out).toEqual({ chats: cached });
    expect(res.headers['X-RateLimit-Cached']).toBe('true');
    expect(cache.get).toHaveBeenCalledWith('chats:list:u-1:default:50:0', Schema);
  });

  it('falls through (degrades) on soft hit when the cache misses', async () => {
    const descriptor: RateLimitDescriptor = {
      preset: 'chats',
      mode: 'soft',
      identify: () => 'u-1',
      softCache: { key: () => 'chats:list:u-1:default:50:0', schema: z.array(z.unknown()) },
    };
    const { ctx, res } = buildCtx(descriptor);
    const limiter = {
      consume: vi
        .fn()
        .mockResolvedValue({ limited: true, count: 2, retryAfterSeconds: 1, resetAt: 0 }),
    } as unknown as RateLimitService;
    const cache = { get: vi.fn().mockResolvedValue(null) } as unknown as CacheService;
    const i = new RouteRateLimitInterceptor(new Reflector(), limiter, cache, env());
    const next: CallHandler = { handle: () => of({ chats: ['fresh'] }) };
    const out = await firstValueFrom(await i.intercept(ctx, next));
    expect(out).toEqual({ chats: ['fresh'] });
    expect(res.headers['X-RateLimit-Cached']).toBeUndefined();
  });

  it('is a no-op when RATE_LIMIT_ENABLED is false', async () => {
    const { ctx } = buildCtx({ preset: 'send', mode: 'hard', identify: () => 'u-1' });
    const limiter = { consume: vi.fn() } as unknown as RateLimitService;
    const cache = { get: vi.fn() } as unknown as CacheService;
    const i = new RouteRateLimitInterceptor(
      new Reflector(),
      limiter,
      cache,
      env({ RATE_LIMIT_ENABLED: false }),
    );
    const next: CallHandler = { handle: () => of('ok') };
    const out = await firstValueFrom(await i.intercept(ctx, next));
    expect(out).toBe('ok');
    expect(limiter.consume).not.toHaveBeenCalled();
  });
});
