import { describe, expect, it, vi } from 'vitest';
import { type NextFunction, type Request, type Response } from 'express';
import { CORRELATION_HEADER, CorrelationMiddleware } from './correlation.middleware';

function makeReq(headers: Record<string, string> = {}): Request {
  return {
    header(name: string) {
      return headers[name.toLowerCase()];
    },
  } as unknown as Request;
}

function makeRes(): { res: Response; headers: Record<string, string> } {
  const headers: Record<string, string> = {};
  const res = {
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
  } as unknown as Response;
  return { res, headers };
}

describe('CorrelationMiddleware', () => {
  it('reuses a valid incoming correlation id', () => {
    const incoming = '11111111-2222-3333-4444-555555555555';
    const mw = new CorrelationMiddleware();
    const req = makeReq({ [CORRELATION_HEADER]: incoming });
    const { res, headers } = makeRes();
    const next: NextFunction = vi.fn();

    mw.use(req, res, next);

    expect(req.correlationId).toBe(incoming);
    expect(headers[CORRELATION_HEADER]).toBe(incoming);
    expect(next).toHaveBeenCalledOnce();
  });

  it('generates a new id when the incoming header is missing', () => {
    const mw = new CorrelationMiddleware();
    const req = makeReq();
    const { res, headers } = makeRes();
    const next: NextFunction = vi.fn();

    mw.use(req, res, next);

    expect(req.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(headers[CORRELATION_HEADER]).toBe(req.correlationId);
    expect(next).toHaveBeenCalledOnce();
  });

  it('generates a new id when the incoming header is malformed', () => {
    const mw = new CorrelationMiddleware();
    const req = makeReq({ [CORRELATION_HEADER]: 'not-a-uuid' });
    const { res } = makeRes();
    const next: NextFunction = vi.fn();

    mw.use(req, res, next);

    expect(req.correlationId).not.toBe('not-a-uuid');
    expect(req.correlationId).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
