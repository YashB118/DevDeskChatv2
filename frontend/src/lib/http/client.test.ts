import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';
import { apiClient } from './client';
import { AppApiError } from './errors';
import { _resetRefreshState, registerRefreshHandler } from './retry';
import { clearAccessToken, getAccessToken, setAccessToken } from '@/lib/storage/memory';
import { server } from '@/tests/mocks/server';

const base = 'http://localhost:3005';

afterEach(() => {
  _resetRefreshState();
  clearAccessToken();
});

describe('apiClient interceptors', () => {
  it('attaches the in-memory token on requests', async () => {
    setAccessToken('tok-1');
    let seen: string | null = null;
    server.use(
      http.get(`${base}/api/ping`, ({ request }) => {
        seen = request.headers.get('authorization');
        return HttpResponse.json({ ok: true });
      }),
    );

    await apiClient.get('/api/ping');
    expect(seen).toBe('Bearer tok-1');
  });

  it('silently refreshes on 401 and retries the original request', async () => {
    setAccessToken('expired');
    let calls = 0;
    server.use(
      http.get(`${base}/api/secret`, ({ request }) => {
        calls += 1;
        const auth = request.headers.get('authorization');
        if (auth === 'Bearer fresh') return HttpResponse.json({ secret: 42 });
        return new HttpResponse(
          JSON.stringify({ error: { code: 'TOKEN_EXPIRED', message: 'expired' } }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        );
      }),
    );

    registerRefreshHandler(() => {
      setAccessToken('fresh');
      return Promise.resolve('fresh');
    });

    const res = await apiClient.get('/api/secret');
    expect(res.data).toEqual({ secret: 42 });
    expect(calls).toBe(2);
    expect(getAccessToken()).toBe('fresh');
  });

  it('coalesces concurrent 401s behind a single refresh', async () => {
    setAccessToken('expired');
    let refreshes = 0;
    server.use(
      http.get(`${base}/api/a`, ({ request }) => {
        const auth = request.headers.get('authorization');
        if (auth === 'Bearer fresh') return HttpResponse.json({ a: 1 });
        return new HttpResponse(JSON.stringify({ error: { code: 'X', message: 'x' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }),
      http.get(`${base}/api/b`, ({ request }) => {
        const auth = request.headers.get('authorization');
        if (auth === 'Bearer fresh') return HttpResponse.json({ b: 2 });
        return new HttpResponse(JSON.stringify({ error: { code: 'X', message: 'x' } }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }),
    );

    registerRefreshHandler(async () => {
      refreshes += 1;
      await new Promise((r) => setTimeout(r, 10));
      setAccessToken('fresh');
      return 'fresh';
    });

    const [a, b] = await Promise.all([apiClient.get('/api/a'), apiClient.get('/api/b')]);
    expect(a.data).toEqual({ a: 1 });
    expect(b.data).toEqual({ b: 2 });
    expect(refreshes).toBe(1);
  });

  it('throws AppApiError on non-401 errors with the envelope mapped', async () => {
    server.use(
      http.get(`${base}/api/boom`, () =>
        new HttpResponse(
          JSON.stringify({ error: { code: 'FORBIDDEN', message: 'nope' } }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    await expect(apiClient.get('/api/boom')).rejects.toMatchObject({
      code: 'FORBIDDEN',
      status: 403,
    });
    await expect(apiClient.get('/api/boom')).rejects.toBeInstanceOf(AppApiError);
  });

  it('logs out on refresh failure by surfacing the original 401', async () => {
    setAccessToken('expired');
    server.use(
      http.get(`${base}/api/x`, () =>
        new HttpResponse(
          JSON.stringify({ error: { code: 'TOKEN_EXPIRED', message: 'expired' } }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
      ),
    );

    registerRefreshHandler(() => Promise.reject(new Error('refresh failed')));

    await expect(apiClient.get('/api/x')).rejects.toMatchObject({
      code: 'TOKEN_EXPIRED',
      status: 401,
    });
  });
});
