import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { catchError, throwError, timeout, type Observable, TimeoutError } from 'rxjs';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { RequestTimeoutError } from '@app/shared/errors';

/**
 * Global per-request time budget. Wraps every HTTP handler's observable in
 * rxjs `timeout()` so a stuck downstream call (DB, WAHA, Redis) cannot pin a
 * connection indefinitely.
 *
 * The Node task may still finish after the response is dispatched — this
 * interceptor only bounds the *client-visible* wait. Stuck loops in
 * application code surface via the orchestrator's terminationGracePeriod.
 */
@Injectable()
export class RequestTimeoutInterceptor implements NestInterceptor {
  constructor(@Inject(APP_CONFIG) private readonly env: AppConfig) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    return next.handle().pipe(
      timeout({ each: this.env.REQUEST_TIMEOUT_MS }),
      catchError((err: unknown) => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutError(this.env.REQUEST_TIMEOUT_MS));
        }
        return throwError(() => err);
      }),
    );
  }
}
