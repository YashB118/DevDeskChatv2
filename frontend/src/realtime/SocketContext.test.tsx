import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { createFakeSocket, type FakeSocket } from './__test-utils__/fakeSocket';

let fake: FakeSocket;

vi.mock('./socket', () => {
  return {
    getSocket: () => fake,
    disposeSocket: () => {
      fake.disconnect();
      fake.removeAllListeners();
    },
  };
});

import { eventBus } from './eventBus';
import { SocketProvider } from './SocketContext';
import { useConnectionStatusStore } from './connectionStatusStore';
import { toUserId } from '@/shared/types/ids';

function emitAuthReady(): void {
  eventBus.emit('auth:ready', { userId: toUserId('user-1') });
}

function emitLoggedOut(): void {
  eventBus.emit('auth:logged-out', { reason: 'manual' });
}

describe('SocketProvider', () => {
  beforeEach(() => {
    fake = createFakeSocket();
    useConnectionStatusStore.getState().reset();
  });

  afterEach(() => {
    eventBus.all.clear();
  });

  it('opens the socket on auth:ready and sets connecting → connected', () => {
    render(<SocketProvider><div /></SocketProvider>);
    expect(fake.connectCalls).toBe(0);
    expect(useConnectionStatusStore.getState().status).toBe('idle');

    act(() => { emitAuthReady(); });
    expect(fake.connectCalls).toBe(1);
    expect(useConnectionStatusStore.getState().status).toBe('connecting');

    act(() => { fake.trigger('connect'); });
    expect(useConnectionStatusStore.getState().status).toBe('connected');
  });

  it('moves to reconnecting on disconnect (non-client-initiated)', () => {
    render(<SocketProvider><div /></SocketProvider>);
    act(() => { emitAuthReady(); });
    act(() => { fake.trigger('connect'); });

    act(() => { fake.trigger('disconnect', 'transport close'); });
    expect(useConnectionStatusStore.getState().status).toBe('reconnecting');
  });

  it('emits sync:resume on reconnect', () => {
    const onResume = vi.fn();
    eventBus.on('sync:resume', onResume);

    render(<SocketProvider><div /></SocketProvider>);
    act(() => { emitAuthReady(); });
    act(() => { fake.trigger('connect'); });
    act(() => { fake.trigger('disconnect', 'transport close'); });
    act(() => { fake.triggerManager('reconnect', 1); });

    expect(onResume).toHaveBeenCalledWith({ reason: 'reconnect' });
    expect(useConnectionStatusStore.getState().status).toBe('connected');
    eventBus.off('sync:resume', onResume);
  });

  it('closes the socket and resets status on auth:logged-out', () => {
    render(<SocketProvider><div /></SocketProvider>);
    act(() => { emitAuthReady(); });
    act(() => { fake.trigger('connect'); });

    act(() => { emitLoggedOut(); });
    expect(fake.disconnectCalls).toBeGreaterThanOrEqual(1);
    expect(useConnectionStatusStore.getState().status).toBe('idle');
  });

  it('does not flip to reconnecting on local disconnect', () => {
    render(<SocketProvider><div /></SocketProvider>);
    act(() => { emitAuthReady(); });
    act(() => { fake.trigger('connect'); });

    act(() => { fake.trigger('disconnect', 'io client disconnect'); });
    expect(useConnectionStatusStore.getState().status).toBe('connected');
  });
});
