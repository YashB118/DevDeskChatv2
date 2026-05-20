import { AxiosError, type AxiosResponse } from 'axios';
import { describe, expect, it } from 'vitest';
import { AppApiError } from './errors';

function makeAxiosError(status: number, data: unknown, headers: Record<string, string> = {}): AxiosError {
  const err = new AxiosError('Request failed', String(status));
  err.response = {
    status,
    statusText: '',
    data,
    headers,
    config: {} as never,
  } as AxiosResponse;
  return err;
}

describe('AppApiError.fromAxios', () => {
  it('parses backend error envelope', () => {
    const err = makeAxiosError(
      401,
      { error: { code: 'INVALID_CREDENTIALS', message: 'Bad creds', correlationId: 'cid-1' } },
    );
    const app = AppApiError.fromAxios(err);
    expect(app.code).toBe('INVALID_CREDENTIALS');
    expect(app.message).toBe('Bad creds');
    expect(app.status).toBe(401);
    expect(app.correlationId).toBe('cid-1');
  });

  it('falls back when envelope missing', () => {
    const err = makeAxiosError(500, 'oops');
    const app = AppApiError.fromAxios(err);
    expect(app.code).toBe('UNKNOWN_ERROR');
    expect(app.status).toBe(500);
  });

  it('uses NETWORK_ERROR when no response', () => {
    const err = new AxiosError('Network down');
    const app = AppApiError.fromAxios(err);
    expect(app.code).toBe('NETWORK_ERROR');
    expect(app.status).toBe(0);
  });

  it('reads x-correlation-id header when envelope lacks it', () => {
    const err = makeAxiosError(403, { error: { code: 'FORBIDDEN', message: 'no' } }, {
      'x-correlation-id': 'cid-hdr',
    });
    const app = AppApiError.fromAxios(err);
    expect(app.correlationId).toBe('cid-hdr');
  });
});
