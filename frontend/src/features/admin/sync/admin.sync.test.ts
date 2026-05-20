import { describe, it, expect } from 'vitest';
import { applyUserUpdated } from './admin.sync';
import type { AdminUserList } from '../types';

function list(): AdminUserList {
  return {
    users: [
      {
        id: 'u-1',
        email: 'a@example.com',
        displayName: 'A',
        role: 'DEVELOPER',
        disabled: false,
        createdAt: '0',
      },
      {
        id: 'u-2',
        email: 'b@example.com',
        displayName: 'B',
        role: 'ADMIN',
        disabled: false,
        createdAt: '0',
      },
    ],
  };
}

describe('applyUserUpdated', () => {
  it('flips disabled on the matched user only', () => {
    const next = applyUserUpdated(list(), { id: 'u-1', disabled: true });
    expect(next!.users[0]!.disabled).toBe(true);
    expect(next!.users[1]!.disabled).toBe(false);
  });

  it('updates role when present', () => {
    const next = applyUserUpdated(list(), { id: 'u-1', role: 'ADMIN' });
    expect(next!.users[0]!.role).toBe('ADMIN');
  });

  it('returns undefined when source is undefined', () => {
    expect(applyUserUpdated(undefined, { id: 'u-1' })).toBeUndefined();
  });
});
