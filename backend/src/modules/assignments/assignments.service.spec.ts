import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssignmentsService } from './assignments.service';
import { type AssignmentRepository } from './assignment.repository';
import { type AssignmentDomain } from './assignment.types';
import { AssignmentAlreadyExistsError, AssignmentNotFoundError } from './assignments.errors';
import { AssignmentEvent } from './assignment-history.entity';
import { type AuthRepository } from '@app/modules/auth/auth.repository';
import { type UserRepository } from '@app/modules/users/user.repository';
import { UserNotFoundError } from '@app/modules/users/users.errors';
import { type SocketEmitter } from '@app/realtime/socket.emitter';
import { type TransactionRunner } from '@app/infra/db/transactions';
import { UserId } from '@app/shared/types/ids';
import { UserRole, type UserDomain } from '@app/modules/users/user.types';

function domA(over: Partial<AssignmentDomain> = {}): AssignmentDomain {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    chatId: 'chat-1',
    wahaSessionId: null,
    assignedBy: null,
    assignedAt: new Date('2025-01-01T00:00:00Z'),
    unassignedAt: null,
    isActive: true,
    ...over,
  };
}

function devUser(): UserDomain {
  return {
    id: UserId('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    email: 'd@x',
    role: UserRole.DEVELOPER,
    displayName: 'Dev',
    disabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

interface Stubs {
  repo: AssignmentRepository;
  users: UserRepository;
  auth: AuthRepository;
  emitter: SocketEmitter;
  tx: TransactionRunner;
}

function buildStubs(): Stubs {
  return {
    repo: {
      findActive: vi.fn(),
      findById: vi.fn(),
      insert: vi.fn(),
      deactivate: vi.fn(),
      writeHistory: vi.fn(),
      listAll: vi.fn(),
      listActiveChatIdsForUser: vi.fn(),
      listActiveByChatId: vi.fn(),
      listHistoryFor: vi.fn(),
    } as unknown as AssignmentRepository,
    users: { findById: vi.fn() } as unknown as UserRepository,
    auth: { writeAudit: vi.fn() } as unknown as AuthRepository,
    emitter: {
      toUser: vi.fn(),
      toAdmins: vi.fn(),
    } as unknown as SocketEmitter,
    tx: {
      run: vi.fn(async (fn: (em: unknown) => Promise<unknown>) => fn({})),
    } as unknown as TransactionRunner,
  };
}

function build(stubs: Stubs): AssignmentsService {
  return new AssignmentsService(stubs.repo, stubs.users, stubs.auth, stubs.emitter, stubs.tx);
}

describe('AssignmentsService', () => {
  let stubs: Stubs;
  let svc: AssignmentsService;
  const actor = UserId('00000000-0000-4000-8000-000000000000');

  beforeEach(() => {
    stubs = buildStubs();
    svc = build(stubs);
  });

  it('create() rejects when target user missing', async () => {
    vi.mocked(stubs.users.findById).mockResolvedValue(null);
    await expect(
      svc.create({ userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', chatId: 'c1' }, actor),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('create() rejects duplicate active assignment', async () => {
    vi.mocked(stubs.users.findById).mockResolvedValue(devUser());
    vi.mocked(stubs.repo.findActive).mockResolvedValue(domA());
    await expect(
      svc.create({ userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', chatId: 'chat-1' }, actor),
    ).rejects.toBeInstanceOf(AssignmentAlreadyExistsError);
  });

  it('create() inserts, writes history+audit, emits chat:assigned to user + admins', async () => {
    vi.mocked(stubs.users.findById).mockResolvedValue(devUser());
    vi.mocked(stubs.repo.findActive).mockResolvedValue(null);
    const created = domA();
    vi.mocked(stubs.repo.insert).mockResolvedValue(created);
    const out = await svc.create({ userId: created.userId, chatId: created.chatId }, actor);
    expect(out).toEqual(created);
    expect(stubs.repo.writeHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        assignmentId: created.id,
        event: AssignmentEvent.ASSIGNED,
        actorId: actor,
      }),
      expect.anything(),
    );
    expect(stubs.auth.writeAudit).toHaveBeenCalledWith(
      'assignment.create',
      actor,
      expect.objectContaining({ assignmentId: created.id }),
      expect.anything(),
    );
    expect(stubs.emitter.toUser).toHaveBeenCalledWith(
      created.userId,
      'chat:assigned',
      expect.objectContaining({ assignmentId: created.id, chatId: created.chatId }),
    );
    expect(stubs.emitter.toAdmins).toHaveBeenCalledWith(
      'chat:assigned',
      expect.objectContaining({ assignmentId: created.id }),
    );
  });

  it('remove() rejects unknown / already inactive assignment', async () => {
    vi.mocked(stubs.repo.findById).mockResolvedValue(null);
    await expect(svc.remove('xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx', actor)).rejects.toBeInstanceOf(
      AssignmentNotFoundError,
    );
    vi.mocked(stubs.repo.findById).mockResolvedValue(domA({ isActive: false }));
    await expect(svc.remove('xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx', actor)).rejects.toBeInstanceOf(
      AssignmentNotFoundError,
    );
  });

  it('remove() deactivates, writes history+audit, emits chat:unassigned', async () => {
    const existing = domA();
    const deactivated = domA({ isActive: false, unassignedAt: new Date('2025-02-01T00:00:00Z') });
    vi.mocked(stubs.repo.findById).mockResolvedValue(existing);
    vi.mocked(stubs.repo.deactivate).mockResolvedValue(deactivated);
    await svc.remove(existing.id, actor);
    expect(stubs.repo.writeHistory).toHaveBeenCalledWith(
      expect.objectContaining({ assignmentId: existing.id, event: AssignmentEvent.UNASSIGNED }),
      expect.anything(),
    );
    expect(stubs.emitter.toUser).toHaveBeenCalledWith(
      existing.userId,
      'chat:unassigned',
      expect.objectContaining({ assignmentId: existing.id }),
    );
    expect(stubs.emitter.toAdmins).toHaveBeenCalledWith(
      'chat:unassigned',
      expect.objectContaining({ assignmentId: existing.id }),
    );
  });
});
