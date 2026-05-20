import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { RealtimeGateway } from './realtime.gateway';
import { SocketEmitter } from './socket.emitter';

interface EmitRecord {
  room: string;
  event: string;
  payload: unknown;
}

function makeIoStub(): { emits: EmitRecord[]; server: unknown } {
  const emits: EmitRecord[] = [];
  const server = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emits.push({ room, event, payload });
      },
    }),
  };
  return { emits, server };
}

async function buildEmitter(io: unknown, config: Partial<AppConfig> = {}): Promise<SocketEmitter> {
  const gateway = { server: io } as unknown as RealtimeGateway;
  const mod = await Test.createTestingModule({
    providers: [
      SocketEmitter,
      { provide: RealtimeGateway, useValue: gateway },
      { provide: APP_CONFIG, useValue: { NODE_ENV: 'test', ...config } as AppConfig },
    ],
  }).compile();
  return mod.get(SocketEmitter);
}

describe('SocketEmitter', () => {
  let io: ReturnType<typeof makeIoStub>;

  beforeEach(() => {
    io = makeIoStub();
  });

  it('routes toUser through the user room', async () => {
    const emitter = await buildEmitter(io.server);
    emitter.toUser('u1', 'pong', { nonce: 'n', serverTs: 1, seq: 1 });
    expect(io.emits).toEqual([
      { room: 'user:u1', event: 'pong', payload: { nonce: 'n', serverTs: 1, seq: 1 } },
    ]);
  });

  it('routes toChat through the chat room', async () => {
    const emitter = await buildEmitter(io.server);
    emitter.toChat('c1', 'pong', { nonce: 'n', serverTs: 2, seq: 2 });
    expect(io.emits[0]?.room).toBe('chat:c1');
  });

  it('routes toAdmins through the admin room', async () => {
    const emitter = await buildEmitter(io.server);
    emitter.toAdmins('pong', { nonce: 'n', serverTs: 3, seq: 3 });
    expect(io.emits[0]?.room).toBe('admin');
  });

  it('drops invalid outbound payloads in non-production', async () => {
    const emitter = await buildEmitter(io.server, { NODE_ENV: 'development' });
    // @ts-expect-error — intentional bad payload to exercise validation.
    emitter.toUser('u1', 'pong', { nonce: 'n' });
    expect(io.emits).toHaveLength(0);
  });

  it('skips validation in production', async () => {
    const emitter = await buildEmitter(io.server, { NODE_ENV: 'production' });
    // @ts-expect-error — payload shape intentionally not enforced here.
    emitter.toUser('u1', 'pong', { nonce: 'n' });
    expect(io.emits).toHaveLength(1);
  });

  it('throws if the io server has not been initialised', async () => {
    const gateway = { server: undefined } as unknown as RealtimeGateway;
    const mod = await Test.createTestingModule({
      providers: [
        SocketEmitter,
        { provide: RealtimeGateway, useValue: gateway },
        { provide: APP_CONFIG, useValue: { NODE_ENV: 'test' } as AppConfig },
      ],
    }).compile();
    const emitter = mod.get(SocketEmitter);
    expect(() => {
      emitter.toUser('u1', 'pong', { nonce: 'n', serverTs: 1, seq: 1 });
    }).toThrow(/Socket\.IO server not initialised/);
  });

  it('quiet about logger surface', () => {
    // Sanity: vi is available (avoids unused import warning if logger asserts grow).
    expect(typeof vi.fn).toBe('function');
  });
});
