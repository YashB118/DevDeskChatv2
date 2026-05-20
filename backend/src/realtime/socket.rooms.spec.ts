import { describe, expect, it } from 'vitest';
import { roomFor } from './socket.rooms';

describe('roomFor', () => {
  it('builds user room name', () => {
    expect(roomFor.user('abc')).toBe('user:abc');
  });

  it('builds chat room name', () => {
    expect(roomFor.chat('xyz')).toBe('chat:xyz');
  });

  it('returns the constant admin room', () => {
    expect(roomFor.admin()).toBe('admin');
  });
});
