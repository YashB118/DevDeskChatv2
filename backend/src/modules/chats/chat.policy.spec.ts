import { describe, expect, it } from 'vitest';
import { ChatPolicy } from './chat.policy';
import { type UserDomain, UserRole } from '@app/modules/users/user.types';
import { UserId } from '@app/shared/types/ids';

function user(role: UserRole): UserDomain {
  return {
    id: UserId('00000000-0000-4000-8000-000000000000'),
    email: 'u@x',
    role,
    displayName: 'Dev',
    disabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('ChatPolicy (Phase 8 stub)', () => {
  it('admins see every chat id', () => {
    const policy = new ChatPolicy();
    const visible = policy.filterVisibleChatIds(user(UserRole.ADMIN), ['a', 'b', 'c']);
    expect(visible).toEqual(['a', 'b', 'c']);
  });

  it('developers also see all chats while Phase 9 assignments are pending', () => {
    const policy = new ChatPolicy();
    const visible = policy.filterVisibleChatIds(user(UserRole.DEVELOPER), ['a', 'b']);
    expect(visible).toEqual(['a', 'b']);
  });

  it('canReadChat and canWriteChat are permissive at this phase', () => {
    const policy = new ChatPolicy();
    expect(policy.canReadChat(user(UserRole.DEVELOPER), 'x')).toBe(true);
    expect(policy.canWriteChat(user(UserRole.DEVELOPER), 'x')).toBe(true);
  });
});
