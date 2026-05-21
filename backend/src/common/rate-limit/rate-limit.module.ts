import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { GlobalRateLimitInterceptor } from './global-rate-limit.interceptor';
import { RouteRateLimitInterceptor } from './route-rate-limit.interceptor';
import { RateLimitService } from './rate-limit.service';

/**
 * Provides the rate-limit service + registers two global interceptors:
 *   1. `GlobalRateLimitInterceptor` — IP + per-user floor.
 *   2. `RouteRateLimitInterceptor` — descriptor-driven, per-route caps.
 *
 * Order matters: NestJS executes APP_INTERCEPTOR providers in registration
 * order. The global floor runs first so per-route logic only sees traffic
 * the IP/user caps already let through.
 */
@Global()
@Module({
  providers: [
    RateLimitService,
    { provide: APP_INTERCEPTOR, useClass: GlobalRateLimitInterceptor },
    { provide: APP_INTERCEPTOR, useClass: RouteRateLimitInterceptor },
  ],
  exports: [RateLimitService],
})
export class RateLimitModule {}
