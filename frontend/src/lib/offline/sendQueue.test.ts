import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  _resetSendQueue,
  enqueueSend,
  flushSendQueue,
  getSendQueueSize,
  subscribeSendQueue,
} from './sendQueue';
import { useConnectivityStore } from './connectivity';

beforeEach(() => {
  _resetSendQueue();
  useConnectivityStore.getState().setOnline(true);
});

describe('sendQueue', () => {
  it('enqueue + manual flush runs tasks in order', async () => {
    const calls: number[] = [];
    enqueueSend(() => {
      calls.push(1);
      return Promise.resolve();
    });
    enqueueSend(() => {
      calls.push(2);
      return Promise.resolve();
    });
    expect(getSendQueueSize()).toBe(2);
    await flushSendQueue();
    expect(calls).toEqual([1, 2]);
    expect(getSendQueueSize()).toBe(0);
  });

  it('stops on first failing task; size preserved for retry', async () => {
    let fail = true;
    enqueueSend(() => {
      if (fail) return Promise.reject(new Error('nope'));
      return Promise.resolve();
    });
    enqueueSend(() => Promise.resolve(undefined));

    await flushSendQueue();
    expect(getSendQueueSize()).toBe(2);

    fail = false;
    await flushSendQueue();
    expect(getSendQueueSize()).toBe(0);
  });

  it('subscriber sees size changes', () => {
    const seen: number[] = [];
    const unsub = subscribeSendQueue((s) => seen.push(s));
    enqueueSend(() => Promise.resolve(undefined));
    enqueueSend(() => Promise.resolve(undefined));
    expect(seen).toEqual([1, 2]);
    unsub();
  });

  it('online transition triggers flush', async () => {
    useConnectivityStore.getState().setOnline(false);
    const task = vi.fn(() => Promise.resolve(undefined));
    enqueueSend(task);
    expect(task).not.toHaveBeenCalled();

    useConnectivityStore.getState().setOnline(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(task).toHaveBeenCalledTimes(1);
  });
});
