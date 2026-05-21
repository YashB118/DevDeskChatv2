import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Observable } from 'rxjs';
import { type Request, type Response } from 'express';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { RateLimitedError } from '@app/shared/errors';
import { type AuthenticatedRequestUser } from '@app/modules/auth/auth.types';
import { RateLimitService } from './rate-limit.service';

interface MaybeAuthedRequest extends Request {
  user?: AuthenticatedRequestUser;
}

/**
 * Two-layer floor that runs on every HTTP request, before any route-specific
 * limit:
 *
 *  - Global IP — keyed off `req.ip`, applies even to unauthenticated traffic.
 *  - Per-authenticated-user — applies whenever `req.user` is populated by an
 *    upstream guard (currently `JwtAuthGuard`). Skipped for unauthenticated
 *    routes because the IP layer already covers them.
 *
 * Soft mode is intentionally not supported here — these are anti-abuse caps
 * and a soft fall-through would defeat their purpose.
 */
@Injectable()
export class GlobalRateLimitInterceptor implements NestInterceptor {
  constructor(
    private readonly limiter: RateLimitService,
    @Inject(APP_CONFIG) private readonly env: AppConfig,
  ) {}

  async intercept(ctx: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (!this.env.RATE_LIMIT_ENABLED) return next.handle();
    if (ctx.getType() !== 'http') return next.handle();
    const http = ctx.switchToHttp();
    const req = http.getRequest<MaybeAuthedRequest>();
    const res = http.getResponse<Response>();

    const ip = req.ip;
    if (ip !== undefined && ip !== '') {
      await this.enforce(res, {
        key: `rl:ip:${ip}`,
        windowSeconds: this.env.RATE_LIMIT_IP_WINDOW_SECONDS,
        max: this.env.RATE_LIMIT_IP_MAX,
      });
    }

    const userId = req.user?.id;
    if (userId !== undefined && userId !== '') {
      await this.enforce(res, {
        key: `rl:user:${userId}`,
        windowSeconds: this.env.RATE_LIMIT_USER_WINDOW_SECONDS,
        max: this.env.RATE_LIMIT_USER_MAX,
      });
    }

    return next.handle();
  }

  private async enforce(
    res: Response,
    opts: { key: string; windowSeconds: number; max: number },
  ): Promise<void> {
    const result = await this.limiter.consume(opts);
    if (result.limited) {
      res.setHeader('Retry-After', result.retryAfterSeconds.toString());
      throw new RateLimitedError(result.retryAfterSeconds, { scope: opts.key.split(':')[1] });
    }
  }
}
