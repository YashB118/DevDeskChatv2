import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    off: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
    io: { on: vi.fn(), off: vi.fn() },
  })),
}));

import { io } from 'socket.io-client';
import { disposeSocket, getSocket } from './socket';

describe('socket singleton', () => {
  afterEach(() => {
    disposeSocket();
    vi.clearAllMocks();
  });

  it('constructs one socket across multiple calls', () => {
    const a = getSocket();
    const b = getSocket();
    expect(a).toBe(b);
    expect(vi.mocked(io)).toHaveBeenCalledTimes(1);
  });

  it('passes websocket-only transport + autoConnect false', () => {
    getSocket();
    const opts = vi.mocked(io).mock.calls[0]?.[1];
    expect(opts?.transports).toEqual(['websocket']);
    expect(opts?.autoConnect).toBe(false);
  });

  it('rebuilds after disposeSocket', () => {
    const a = getSocket();
    disposeSocket();
    const b = getSocket();
    expect(a).not.toBe(b);
    expect(vi.mocked(io)).toHaveBeenCalledTimes(2);
  });
});
