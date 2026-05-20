import { describe, expect, it } from 'vitest';
import { ChatPolicy } from './chat.policy';
import { type AssignmentRepository } from '@app/modules/assignments/assignment.repository';
import { type AssignmentDomain } from '@app/modules/assignments/assignment.types';
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

function fakeAssignmentRepo(
  opts: {
    activeForUser?: string[];
    activeFor?: Record<string, AssignmentDomain | null>;
  } = {},
): AssignmentRepository {
  return {
    listActiveChatIdsForUser: async () => opts.activeForUser ?? [],
    findActive: async (_userId: string, chatId: string) => opts.activeFor?.[chatId] ?? null,
  } as unknown as AssignmentRepository;
}

describe('ChatPolicy (Phase 9)', () => {
  it('admins see every chat id', async () => {
    const policy = new ChatPolicy(fakeAssignmentRepo());
    const visible = await policy.filterVisibleChatIds(user(UserRole.ADMIN), ['a', 'b', 'c']);
    expect(visible).toEqual(['a', 'b', 'c']);
  });

  it('developers only see chats with an active assignment', async () => {
    const policy = new ChatPolicy(fakeAssignmentRepo({ activeForUser: ['a'] }));
    const visible = await policy.filterVisibleChatIds(user(UserRole.DEVELOPER), ['a', 'b']);
    expect(visible).toEqual(['a']);
  });

  it('canReadChat / canWriteChat are gated by assignment for developers', async () => {
    const assigned: AssignmentDomain = {
      id: 'aid',
      userId: '00000000-0000-4000-8000-000000000000',
      chatId: 'x',
      wahaSessionId: null,
      assignedBy: null,
      assignedAt: new Date(),
      unassignedAt: null,
      isActive: true,
    };
    const policy = new ChatPolicy(fakeAssignmentRepo({ activeFor: { x: assigned, y: null } }));
    expect(await policy.canReadChat(user(UserRole.DEVELOPER), 'x')).toBe(true);
    expect(await policy.canWriteChat(user(UserRole.DEVELOPER), 'y')).toBe(false);
  });

  it('admins bypass assignment for read/write', async () => {
    const policy = new ChatPolicy(fakeAssignmentRepo());
    expect(await policy.canReadChat(user(UserRole.ADMIN), 'any')).toBe(true);
    expect(await policy.canWriteChat(user(UserRole.ADMIN), 'any')).toBe(true);
  });
});
