import { BadRequestException, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { AppError, NotFoundError } from '@app/shared/errors';

interface CapturedResponse {
  status: number;
  body: unknown;
}

function makeHost(correlationId = 'test-corr-id'): {
  host: ArgumentsHost;
  captured: CapturedResponse;
} {
  const captured: CapturedResponse = { status: 0, body: null };
  const res = {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: unknown) {
      captured.body = body;
      return this;
    },
  };
  const req = { correlationId, log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } };
  const host = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('maps AppError to its statusCode and code', () => {
    const { host, captured } = makeHost();
    filter.catch(new NotFoundError('Chat missing', { chatId: 'abc' }), host);

    expect(captured.status).toBe(404);
    expect(captured.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Chat missing',
        correlationId: 'test-corr-id',
        details: { chatId: 'abc' },
      },
    });
  });

  it('maps ZodError to 400 VALIDATION_ERROR with issue details', () => {
    const { host, captured } = makeHost();
    const parsed = z.object({ x: z.string() }).safeParse({ x: 1 });
    if (parsed.success) throw new Error('expected failure');

    filter.catch(parsed.error, host);

    expect(captured.status).toBe(400);
    const body = captured.body as { error: { code: string; details?: { issues: unknown[] } } };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details?.issues).toHaveLength(1);
  });

  it('passes through HttpException status', () => {
    const { host, captured } = makeHost();
    filter.catch(new BadRequestException('bad'), host);
    expect(captured.status).toBe(400);
    expect((captured.body as { error: { code: string } }).error.code).toBe('BAD_REQUEST');
  });

  it('falls back to 500 INTERNAL_ERROR for unknown throws', () => {
    const { host, captured } = makeHost();
    filter.catch(new Error('boom'), host);
    expect(captured.status).toBe(500);
    expect((captured.body as { error: { code: string } }).error.code).toBe('INTERNAL_ERROR');
  });

  it('does not leak stack traces in the response body', () => {
    const { host, captured } = makeHost();
    filter.catch(new Error('with stack'), host);
    const body = captured.body as { error: { stack?: unknown } };
    expect(body.error.stack).toBeUndefined();
  });

  it('preserves a custom AppError code', () => {
    const { host, captured } = makeHost();
    const custom = new AppError({ code: 'TEAPOT', statusCode: 418, message: 'short and stout' });
    filter.catch(custom, host);
    expect(captured.status).toBe(418);
    expect((captured.body as { error: { code: string } }).error.code).toBe('TEAPOT');
  });
});
