import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { Observable, tap } from 'rxjs';
import { httpRequestDuration, httpRequestsTotal } from './metrics.registry';

interface RouteCarrier {
  path?: string;
}

/**
 * HTTP interceptor wired globally in main.ts. Records duration + outcome on
 * every request using the matched route pattern (never the raw path — high
 * cardinality kills Prometheus). Errors are observed via the `error` callback
 * so the global filter still owns the response shape.
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const method = req.method.toUpperCase();
    const start = process.hrtime.bigint();

    return next.handle().pipe(
      tap({
        next: () => {
          this.record(req, res, method, start, res.statusCode);
        },
        error: (err: unknown) => {
          const status =
            err !== null &&
            typeof err === 'object' &&
            'status' in err &&
            typeof err.status === 'number'
              ? err.status
              : 500;
          this.record(req, res, method, start, status);
        },
      }),
    );
  }

  private record(
    req: Request,
    _res: Response,
    method: string,
    start: bigint,
    status: number,
  ): void {
    const route = resolveRoute(req);
    const durationSec = Number(process.hrtime.bigint() - start) / 1_000_000_000;
    const labels = { method, route, status: String(status) };
    httpRequestDuration.observe(labels, durationSec);
    httpRequestsTotal.inc(labels);
  }
}

function resolveRoute(req: Request): string {
  // Express attaches the matched route pattern under `req.route.path`. When
  // unavailable (404, middleware-rejected), fall back to a hash bucket so we
  // don't blow up Prometheus cardinality.
  const route = (req as unknown as { route?: RouteCarrier }).route?.path;
  if (typeof route === 'string' && route.length > 0) {
    const base = req.baseUrl.replace(/\/+$/, '');
    return `${base}${route}` || '/';
  }
  return req.path === '/' ? '/' : 'unmatched';
}
