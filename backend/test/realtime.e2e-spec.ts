import { generateKeyPairSync } from 'node:crypto';
import { type AddressInfo } from 'node:net';
import { type INestApplication, Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { REDIS_CLIENT } from '@app/infra/cache/constants';
import { UserRole } from '@app/modules/users/user.types';
import { RealtimeGateway } from '@app/realtime/realtime.gateway';
import { SequenceService } from '@app/realtime/sequence';
import { SocketEmitter } from '@app/realtime/socket.emitter';
import { WsAuthGuard } from '@app/realtime/ws-jwt.guard';

// In-memory stand-in for ioredis. Just enough surface for SequenceService.
function makeFakeRedis(): unknown {
  const map = new Map<string, number>();
  return {
    incr: async (k: string) => {
      const next = (map.get(k) ?? 0) + 1;
      map.set(k, next);
      return next;
    },
    get: async (k: string) => {
      const v = map.get(k);
      return v === undefined ? null : String(v);
    },
    del: async (k: string) => {
      map.delete(k);
      return 1;
    },
  };
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const PRIVATE_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const PUBLIC_PEM = publicKey.export({ type: 'spki', format: 'pem' }).toString();

const TEST_CONFIG: AppConfig = {
  JWT_PRIVATE_KEY: PRIVATE_PEM,
  JWT_PUBLIC_KEY: PUBLIC_PEM,
  JWT_ISSUER: 'test-iss',
  JWT_AUDIENCE: 'test-aud',
  JWT_ACCESS_TTL_SECONDS: 900,
  CORS_ORIGINS: ['*'],
  NODE_ENV: 'test',
} as unknown as AppConfig;

@Module({
  imports: [
    JwtModule.register({
      privateKey: PRIVATE_PEM,
      publicKey: PUBLIC_PEM,
      signOptions: {
        algorithm: 'RS256',
        issuer: 'test-iss',
        audience: 'test-aud',
        expiresIn: 900,
      },
      verifyOptions: { algorithms: ['RS256'], issuer: 'test-iss', audience: 'test-aud' },
    }),
  ],
  providers: [
    RealtimeGateway,
    WsAuthGuard,
    SequenceService,
    SocketEmitter,
    { provide: APP_CONFIG, useValue: TEST_CONFIG },
    { provide: REDIS_CLIENT, useFactory: makeFakeRedis },
  ],
})
class TestRealtimeModule {}

interface Harness {
  app: INestApplication;
  jwt: JwtService;
  port: number;
  emitter: SocketEmitter;
}

async function startApp(): Promise<Harness> {
  const mod = await Test.createTestingModule({ imports: [TestRealtimeModule] }).compile();
  const app = mod.createNestApplication();
  // Default in-memory IoAdapter — no Redis adapter required for these tests.
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.init();
  await app.listen(0);
  const httpServer = app.getHttpServer() as { address: () => AddressInfo };
  const address = httpServer.address();
  const port = address.port;
  return {
    app,
    jwt: app.get(JwtService),
    port,
    emitter: app.get(SocketEmitter),
  };
}

function connect(port: number, token: string | null): ClientSocket {
  return ioClient(`http://localhost:${port.toString()}`, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    ...(token ? { auth: { token } } : {}),
  });
}

function waitFor<T>(socket: ClientSocket, event: string, timeoutMs = 2000): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(`timeout waiting for "${event}"`));
    }, timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(t);
      resolve(payload);
    });
  });
}

function waitForDisconnect(socket: ClientSocket, timeoutMs = 2000): Promise<string> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error('timeout waiting for disconnect'));
    }, timeoutMs);
    socket.once('disconnect', (reason: string) => {
      clearTimeout(t);
      resolve(reason);
    });
  });
}

function waitForConnect(socket: ClientSocket, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error('timeout waiting for connect'));
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(t);
      resolve();
    });
    socket.once('connect_error', (err: Error) => {
      clearTimeout(t);
      reject(err);
    });
  });
}

describe('Realtime gateway (Phase 4)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await startApp();
  });

  afterAll(async () => {
    await harness.app.close();
  });

  describe('handshake auth', () => {
    let client: ClientSocket | null = null;

    beforeEach(() => {
      client = null;
    });

    afterAll(() => {
      if (client?.connected) client.disconnect();
    });

    it('rejects connections without a token', async () => {
      client = connect(harness.port, null);
      const reason = await waitForDisconnect(client);
      expect(reason).toBeTruthy();
    });

    it('rejects connections with an invalid token', async () => {
      client = connect(harness.port, 'not-a-jwt');
      const reason = await waitForDisconnect(client);
      expect(reason).toBeTruthy();
    });

    it('accepts a valid token and round-trips ping/pong', async () => {
      const token = await harness.jwt.signAsync({
        sub: 'user-a',
        email: 'a@example.com',
        role: UserRole.DEVELOPER,
      });
      client = connect(harness.port, token);
      await waitForConnect(client);
      const pong = waitFor<{ nonce: string; serverTs: number; seq: number }>(client, 'pong');
      client.emit('ping', { nonce: 'abc' });
      const payload = await pong;
      expect(payload.nonce).toBe('abc');
      expect(payload.seq).toBeGreaterThan(0);
      expect(payload.serverTs).toBeGreaterThan(0);
    });
  });

  describe('auto-join rooms', () => {
    it('admin client joins both user:<id> and admin rooms', async () => {
      const token = await harness.jwt.signAsync({
        sub: 'user-admin',
        email: 'admin@example.com',
        role: UserRole.ADMIN,
      });
      const client = connect(harness.port, token);
      await waitForConnect(client);

      // Emitter pushes a payload to the admin room — only joined sockets see it.
      const seen = waitFor<{ nonce: string; serverTs: number; seq: number }>(client, 'pong');
      harness.emitter.toAdmins('pong', { nonce: 'broadcast', serverTs: 1, seq: 1 });
      const payload = await seen;
      expect(payload.nonce).toBe('broadcast');
      client.disconnect();
    });

    it('non-admin client receives a user-targeted broadcast but not admin broadcast', async () => {
      const token = await harness.jwt.signAsync({
        sub: 'user-dev',
        email: 'dev@example.com',
        role: UserRole.DEVELOPER,
      });
      const client = connect(harness.port, token);
      await waitForConnect(client);

      const seen = waitFor<{ nonce: string }>(client, 'pong');
      // Admin broadcast first — must NOT reach this socket because it isn't in the admin room.
      harness.emitter.toAdmins('pong', { nonce: 'admin-only', serverTs: 1, seq: 1 });
      harness.emitter.toUser('user-dev', 'pong', { nonce: 'for-me', serverTs: 2, seq: 2 });

      const payload = await seen;
      expect(payload.nonce).toBe('for-me');
      client.disconnect();
    });
  });

  describe('chats:join', () => {
    it('joins requested chat rooms and emitter delivery follows', async () => {
      const token = await harness.jwt.signAsync({
        sub: 'user-c',
        email: 'c@example.com',
        role: UserRole.DEVELOPER,
      });
      const client = connect(harness.port, token);
      await waitForConnect(client);

      const chatId = '11111111-2222-3333-4444-555555555555';

      await new Promise<void>((resolve, reject) => {
        client.emit('chats:join', { chatIds: [chatId] }, (ack: unknown) => {
          if (ack && typeof ack === 'object' && 'joined' in ack) resolve();
          else reject(new Error(`unexpected ack: ${JSON.stringify(ack)}`));
        });
      });

      const seen = waitFor<{ nonce: string }>(client, 'pong');
      harness.emitter.toChat(chatId, 'pong', { nonce: 'chat-msg', serverTs: 1, seq: 1 });
      const payload = await seen;
      expect(payload.nonce).toBe('chat-msg');

      client.disconnect();
    });

    it('rejects an invalid chats:join payload via the ws zod pipe', async () => {
      const token = await harness.jwt.signAsync({
        sub: 'user-d',
        email: 'd@example.com',
        role: UserRole.DEVELOPER,
      });
      const client = connect(harness.port, token);
      await waitForConnect(client);

      const err = await new Promise<{ code?: string } | null>((resolve) => {
        // Bad payload: chatIds must be an array of UUIDs.
        client.emit('chats:join', { chatIds: ['not-a-uuid'] }, (ack: unknown) => {
          resolve(ack as { code?: string } | null);
        });
        setTimeout(() => {
          resolve(null);
        }, 1500);
      });

      // Either an error ack or an `exception` event is emitted by the ws framework.
      // We only assert that the bad payload did not silently succeed.
      const success =
        err && typeof err === 'object' && 'joined' in (err as Record<string, unknown>);
      expect(success).toBeFalsy();
      client.disconnect();
    });
  });
});
