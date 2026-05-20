import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REDIS_CLIENT } from '@app/infra/cache/constants';
import { SequenceService } from './sequence';

describe('SequenceService', () => {
  let store: Map<string, number>;
  let svc: SequenceService;

  beforeEach(async () => {
    store = new Map();
    const redisStub = {
      incr: async (k: string) => {
        const next = (store.get(k) ?? 0) + 1;
        store.set(k, next);
        return next;
      },
      get: async (k: string) => {
        const v = store.get(k);
        return v === undefined ? null : String(v);
      },
      del: async (k: string) => {
        store.delete(k);
        return 1;
      },
    };

    const mod = await Test.createTestingModule({
      providers: [SequenceService, { provide: REDIS_CLIENT, useValue: redisStub }],
    }).compile();

    svc = mod.get(SequenceService);
  });

  afterEach(() => {
    store.clear();
  });

  it('next() returns a strictly increasing value per stream', async () => {
    await expect(svc.next('chat:1')).resolves.toBe(1);
    await expect(svc.next('chat:1')).resolves.toBe(2);
    await expect(svc.next('chat:1')).resolves.toBe(3);
  });

  it('next() is independent across streams', async () => {
    await expect(svc.next('chat:a')).resolves.toBe(1);
    await expect(svc.next('chat:b')).resolves.toBe(1);
    await expect(svc.next('chat:a')).resolves.toBe(2);
  });

  it('current() returns 0 before any increment', async () => {
    await expect(svc.current('chat:fresh')).resolves.toBe(0);
  });

  it('current() reflects last value', async () => {
    await svc.next('s');
    await svc.next('s');
    await expect(svc.current('s')).resolves.toBe(2);
  });

  it('reset() clears the stream counter', async () => {
    await svc.next('s');
    await svc.reset('s');
    await expect(svc.current('s')).resolves.toBe(0);
    await expect(svc.next('s')).resolves.toBe(1);
  });
});
