import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MuteService } from './mute.service';
import { type MuteRepository } from './mute.repository';
import { type AssignmentRepository } from '@app/modules/assignments/assignment.repository';
import { type AuthRepository } from '@app/modules/auth/auth.repository';
import { ForbiddenError } from '@app/modules/auth/auth.errors';
import { UserRole, type UserDomain } from '@app/modules/users/user.types';
import { UserId } from '@app/shared/types/ids';

function adminUser(): UserDomain {
  return {
    id: UserId('11111111-1111-4111-8111-111111111111'),
    email: 'a@x',
    role: UserRole.ADMIN,
    displayName: 'Admin',
    disabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function devUser(): UserDomain {
  return {
    id: UserId('22222222-2222-4222-8222-222222222222'),
    email: 'd@x',
    role: UserRole.DEVELOPER,
    displayName: 'Dev',
    disabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

interface Stubs {
  repo: MuteRepository;
  assignments: AssignmentRepository;
  auth: AuthRepository;
}

function buildStubs(): Stubs {
  return {
    repo: {
      setChatMute: vi.fn(),
      isChatMuted: vi.fn(),
      mutedChatIdsForUser: vi.fn(),
      filterMutedChatIds: vi.fn(),
      setGlobalMute: vi.fn(),
      getGlobalMute: vi.fn(),
    } as unknown as MuteRepository,
    assignments: { findActive: vi.fn() } as unknown as AssignmentRepository,
    auth: { writeAudit: vi.fn() } as unknown as AuthRepository,
  };
}

describe('MuteService', () => {
  let stubs: Stubs;
  let svc: MuteService;

  beforeEach(() => {
    stubs = buildStubs();
    svc = new MuteService(stubs.repo, stubs.assignments, stubs.auth);
  });

  it('admin can mute any chat', async () => {
    await svc.setChatMute(adminUser(), 'any-chat', true);
    expect(stubs.repo.setChatMute).toHaveBeenCalledWith(adminUser().id, 'any-chat', true);
    expect(stubs.auth.writeAudit).toHaveBeenCalledWith('mute.chat.set', adminUser().id, {
      chatId: 'any-chat',
      muted: true,
    });
  });

  it('developer cannot mute chat without active assignment', async () => {
    vi.mocked(stubs.assignments.findActive).mockResolvedValue(null);
    await expect(svc.setChatMute(devUser(), 'chat-x', true)).rejects.toBeInstanceOf(ForbiddenError);
    expect(stubs.repo.setChatMute).not.toHaveBeenCalled();
  });

  it('developer can mute chat with active assignment', async () => {
    vi.mocked(stubs.assignments.findActive).mockResolvedValue({
      id: 'a',
      userId: devUser().id,
      chatId: 'chat-x',
      wahaSessionId: null,
      assignedBy: null,
      assignedAt: new Date(),
      unassignedAt: null,
      isActive: true,
    });
    await svc.setChatMute(devUser(), 'chat-x', true);
    expect(stubs.repo.setChatMute).toHaveBeenCalledWith(devUser().id, 'chat-x', true);
  });

  it('global mute set writes audit', async () => {
    vi.mocked(stubs.repo.setGlobalMute).mockResolvedValue({
      userId: devUser().id,
      enabled: true,
      updatedAt: new Date(),
    });
    const out = await svc.setGlobalMute(devUser(), true);
    expect(out.enabled).toBe(true);
    expect(stubs.auth.writeAudit).toHaveBeenCalledWith('mute.global.set', devUser().id, {
      enabled: true,
    });
  });
});
