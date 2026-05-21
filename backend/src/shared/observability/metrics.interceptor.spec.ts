import { describe, expect, it, beforeEach } from 'vitest';
import { Observable, lastValueFrom, throwError } from 'rxjs';
import { type ExecutionContext } from '@nestjs/common';
import { MetricsInterceptor } from './metrics.interceptor';
import { httpRequestsTotal } from './metrics.registry';

interface FakeRoute {
  path?: string;
}

function ctx(
  method: string,
  route: FakeRoute | undefined,
  status = 200,
  path = '/some-path',
): ExecutionContext {
  const req = { method, route, path, baseUrl: '' };
  const res = { statusCode: status };
  return {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
}

describe('MetricsInterceptor', () => {
  let interceptor: MetricsInterceptor;

  beforeEach(() => {
    httpRequestsTotal.reset();
    interceptor = new MetricsInterceptor();
  });

  it('records the matched route pattern on success', async () => {
    const stream$ = interceptor.intercept(ctx('GET', { path: '/chats' }), {
      handle: () =>
        new Observable((sub) => {
          sub.next('ok');
          sub.complete();
        }),
    });
    await lastValueFrom(stream$);
    const samples = await httpRequestsTotal.get();
    const labels = samples.values.map((v) => v.labels);
    expect(labels).toEqual([{ method: 'GET', route: '/chats', status: '200' }]);
  });

  it('uses "unmatched" when no route pattern resolved (e.g. 404)', async () => {
    const stream$ = interceptor.intercept(ctx('GET', undefined, 404), {
      handle: () =>
        new Observable((sub) => {
          sub.next('ok');
          sub.complete();
        }),
    });
    await lastValueFrom(stream$);
    const samples = await httpRequestsTotal.get();
    expect(samples.values[0]?.labels.route).toBe('unmatched');
  });

  it('records error status when handler throws', async () => {
    const stream$ = interceptor.intercept(ctx('POST', { path: '/auth/login' }), {
      handle: () => throwError(() => Object.assign(new Error('boom'), { status: 401 })),
    });
    await expect(lastValueFrom(stream$)).rejects.toThrow('boom');
    const samples = await httpRequestsTotal.get();
    expect(samples.values[0]?.labels).toMatchObject({
      method: 'POST',
      route: '/auth/login',
      status: '401',
    });
  });

  it('skips non-http contexts', () => {
    const stream$ = interceptor.intercept({ getType: () => 'ws' } as unknown as ExecutionContext, {
      handle: () => new Observable(),
    });
    expect(stream$).toBeInstanceOf(Observable);
  });
});
