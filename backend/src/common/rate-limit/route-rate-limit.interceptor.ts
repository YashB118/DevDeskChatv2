import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of, type Observable } from 'rxjs';
import { type Request, type Response } from 'express';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { CacheService } from '@app/infra/cache/cache.service';
import { RateLimitedError } from '@app/shared/errors';
import { RATE_LIMIT_META, ratePresetCaps, type RateLimitDescriptor } from './rate-limit.types';
import { RateLimitService } from './rate-limit.service';

/**
 * Route-level rate limit. Reads the `@RateLimit({...})` descriptor off the
 * handler/class via Reflector. Two modes:
 *
 *  - `hard` — 429 with `Retry-After` (the canonical surface).
 *  - `soft` — serve the last cached response with `X-RateLimit-Cached: true`.
 *    If the cache miss, fall through to the handler so we never black-hole
 *    legitimate traffic (the IP/user layers still apply).
 */
@Injectable()
export class RouteRateLimitInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RouteRateLimitInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimitService,
    private readonly cache: CacheService,
    @Inject(APP_CONFIG) private readonly env: AppConfig,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (!this.env.RATE_LIMIT_ENABLED) return next.handle();
    if (ctx.getType() !== 'http') return next.handle();

    const descriptor = this.reflector.getAllAndOverride<RateLimitDescriptor | undefined>(
      RATE_LIMIT_META,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (descriptor === undefined) return next.handle();

    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const identity = descriptor.identify(req);
    if (identity === null) return next.handle();

    const caps = ratePresetCaps[descriptor.preset](this.env);
    const key = `rl:${descriptor.preset}:${identity}`;
    const result = await this.limiter.consume({
      key,
      windowSeconds: caps.windowSeconds,
      max: caps.max,
    });
    res.setHeader('X-RateLimit-Limit', caps.max.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, caps.max - result.count).toString());

    if (!result.limited) return next.handle();

    if (descriptor.mode === 'hard') {
      res.setHeader('Retry-After', result.retryAfterSeconds.toString());
      throw new RateLimitedError(result.retryAfterSeconds, { scope: descriptor.preset });
    }

    const softCache = descriptor.softCache;
    if (softCache === undefined) return next.handle();

    const softKey = softCache.key(req);
    if (softKey === null) return next.handle();
    const cached = await this.cache.get(softKey, softCache.schema);
    if (cached === null) {
      this.logger.debug(`Soft limit ${descriptor.preset} hit but no cached value at ${softKey}`);
      return next.handle();
    }
    const body = softCache.wrap === undefined ? cached : softCache.wrap(cached);
    res.setHeader('X-RateLimit-Cached', 'true');
    res.setHeader('Retry-After', result.retryAfterSeconds.toString());
    return of(body);
  }
}
