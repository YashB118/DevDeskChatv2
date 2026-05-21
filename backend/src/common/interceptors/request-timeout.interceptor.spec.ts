import { describe, expect, it } from 'vitest';
import { type ExecutionContext, type CallHandler } from '@nestjs/common';
import { firstValueFrom, Observable } from 'rxjs';
import { type AppConfig } from '@app/config/env';
import { RequestTimeoutError } from '@app/shared/errors';
import { RequestTimeoutInterceptor } from './request-timeout.interceptor';

function httpCtx(): ExecutionContext {
  return {
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

function env(timeoutMs: number): AppConfig {
  return { REQUEST_TIMEOUT_MS: timeoutMs } as AppConfig;
}

describe('RequestTimeoutInterceptor', () => {
  it('passes through fast handlers', async () => {
    const i = new RequestTimeoutInterceptor(env(1000));
    const next: CallHandler = {
      handle: () =>
        new Observable<string>((sub) => {
          sub.next('fast');
          sub.complete();
        }),
    };
    const out = await firstValueFrom(i.intercept(httpCtx(), next));
    expect(out).toBe('fast');
  });

  it('converts rxjs TimeoutError into a RequestTimeoutError with 503', async () => {
    const i = new RequestTimeoutInterceptor(env(10));
    const next: CallHandler = {
      handle: () =>
        new Observable<string>((sub) => {
          setTimeout(() => {
            sub.next('late');
          }, 100);
        }),
    };
    await expect(firstValueFrom(i.intercept(httpCtx(), next))).rejects.toMatchObject({
      code: 'REQUEST_TIMEOUT',
      statusCode: 503,
    });
  });

  it('rethrows handler errors verbatim', async () => {
    const i = new RequestTimeoutInterceptor(env(1000));
    const next: CallHandler = {
      handle: () =>
        new Observable<string>((sub) => {
          sub.error(new Error('boom'));
        }),
    };
    await expect(firstValueFrom(i.intercept(httpCtx(), next))).rejects.toThrow('boom');
  });

  it('skips non-HTTP contexts', async () => {
    const i = new RequestTimeoutInterceptor(env(10));
    const wsCtx = { getType: () => 'ws' } as unknown as ExecutionContext;
    const next: CallHandler = {
      handle: () =>
        new Observable<string>((sub) => {
          setTimeout(() => {
            sub.next('late-but-ok');
          }, 50);
        }),
    };
    const out = await firstValueFrom(i.intercept(wsCtx, next));
    expect(out).toBe('late-but-ok');
  });
});

// RequestTimeoutError shape sanity — keeps the envelope contract from drifting.
describe('RequestTimeoutError', () => {
  it('exposes statusCode 503 and code REQUEST_TIMEOUT', () => {
    const e = new RequestTimeoutError(2500);
    expect(e.code).toBe('REQUEST_TIMEOUT');
    expect(e.statusCode).toBe(503);
    expect(e.details?.timeoutMs).toBe(2500);
  });
});
