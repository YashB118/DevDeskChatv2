import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { type AppConfig } from '@app/config/env';
import { ExternalServiceError } from '@app/shared/errors';
import { WahaClient } from './waha.client';

interface RouteRecord {
  method: string;
  path: string;
  apiKey?: string;
  body?: string;
}

const records: RouteRecord[] = [];
let server: Server;
let baseUrl = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const apiKey = req.headers['x-api-key'];
      const path = req.url ?? '';
      const method = req.method ?? 'GET';
      records.push({
        method,
        path,
        ...(typeof apiKey === 'string' ? { apiKey } : {}),
        ...(body === '' ? {} : { body }),
      });

      res.setHeader('content-type', 'application/json');
      if (path === '/api/sessions' && method === 'GET') {
        res.end(JSON.stringify([{ name: 's1', status: 'WORKING' }]));
        return;
      }
      if (path === '/api/sendText' && method === 'POST') {
        res.end(JSON.stringify({ id: 'm1', chatId: 'c1', body: 'hi' }));
        return;
      }
      if (path.startsWith('/api/sessions/') && path.endsWith('/start')) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'boom' }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
    });
  });
  await new Promise<void>((resolve) =>
    server.listen(0, '127.0.0.1', () => {
      resolve();
    }),
  );
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${String(addr.port)}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
});

function client(env: Partial<AppConfig> = {}): WahaClient {
  return new WahaClient({
    WAHA_BASE_URL: baseUrl,
    WAHA_API_KEY: 'secret-key',
    WAHA_TIMEOUT_MS: 5000,
    WAHA_MEDIA_TIMEOUT_MS: 10000,
    ...env,
  } as AppConfig);
}

describe('WahaClient', () => {
  it('sends X-Api-Key header from env', async () => {
    records.length = 0;
    await client().listSessions();
    expect(records[0]?.apiKey).toBe('secret-key');
  });

  it('omits X-Api-Key when WAHA_API_KEY is unset', async () => {
    records.length = 0;
    await client({ WAHA_API_KEY: undefined }).listSessions();
    expect(records[0]?.apiKey).toBeUndefined();
  });

  it('posts JSON body for sendText', async () => {
    records.length = 0;
    await client().sendText({ session: 's1', chatId: 'c1', text: 'hi' });
    expect(records[0]?.method).toBe('POST');
    expect(records[0]?.body).toContain('"text":"hi"');
  });

  it('wraps 5xx responses into ExternalServiceError with status detail', async () => {
    const c = client();
    const err = (await c.startSession('s1').catch((e: unknown) => e)) as ExternalServiceError;
    expect(err).toBeInstanceOf(ExternalServiceError);
    expect(err.code).toBe('WAHA_5XX');
    expect(err.details?.status).toBe(500);
  });

  it('wraps 404 responses with WAHA_HTTP_ERROR code', async () => {
    const c = client();
    const err = (await c.getSession('missing').catch((e: unknown) => e)) as ExternalServiceError;
    expect(err.code).toBe('WAHA_HTTP_ERROR');
    expect(err.details?.status).toBe(404);
  });
});
