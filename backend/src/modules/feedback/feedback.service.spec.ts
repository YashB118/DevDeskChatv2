import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackService } from './feedback.service';
import { type FeedbackRepository } from './feedback.repository';
import { type FeedbackDomain } from './feedback.types';
import { ForbiddenError } from '@app/modules/auth/auth.errors';
import { NotFoundError } from '@app/shared/errors';
import { UserRole, type UserDomain } from '@app/modules/users/user.types';
import { UserId } from '@app/shared/types/ids';
import { type SocketEmitter } from '@app/realtime/socket.emitter';

function dom(over: Partial<FeedbackDomain> = {}): FeedbackDomain {
  return {
    id: 'fb-1',
    userId: 'dev-1',
    body: 'hello',
    read: false,
    createdAt: new Date(),
    ...over,
  };
}

function user(role: UserRole, id = '00000000-0000-4000-8000-000000000000'): UserDomain {
  return {
    id: UserId(id),
    email: 'u@x',
    role,
    displayName: 'U',
    disabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe('FeedbackService', () => {
  let repo: FeedbackRepository;
  let emitter: SocketEmitter;
  let svc: FeedbackService;

  beforeEach(() => {
    repo = {
      insert: vi.fn(),
      list: vi.fn(),
      findById: vi.fn(),
      markRead: vi.fn(),
      setRead: vi.fn(),
    } as unknown as FeedbackRepository;
    emitter = {
      toUser: vi.fn(),
      toChat: vi.fn(),
      toAdmins: vi.fn(),
      toSocket: vi.fn(),
      disconnectUser: vi.fn(),
    } as unknown as SocketEmitter;
    svc = new FeedbackService(repo, emitter);
  });

  it('submit emits feedback:new to admins with id + numeric ts', async () => {
    const created = dom({ id: 'fb-9', createdAt: new Date('2026-03-01T00:00:00.000Z') });
    vi.mocked(repo.insert).mockResolvedValue(created);
    await svc.submit(user(UserRole.DEVELOPER), { body: 'hi' });
    expect(emitter.toAdmins).toHaveBeenCalledWith('feedback:new', {
      id: 'fb-9',
      ts: created.createdAt.getTime(),
    });
  });

  it('developer list is filtered by their userId', async () => {
    vi.mocked(repo.list).mockResolvedValue([]);
    await svc.list(user(UserRole.DEVELOPER, 'dev-id'), {});
    expect(repo.list).toHaveBeenCalledWith({ userId: 'dev-id' });
  });

  it('admin list returns everything (no userId filter)', async () => {
    vi.mocked(repo.list).mockResolvedValue([]);
    await svc.list(user(UserRole.ADMIN), { unreadOnly: true, limit: 10 });
    expect(repo.list).toHaveBeenCalledWith({ unreadOnly: true, limit: 10 });
  });

  it('only admin can mark feedback read', async () => {
    vi.mocked(repo.findById).mockResolvedValue(dom());
    await expect(svc.markRead(user(UserRole.DEVELOPER), 'fb-1')).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it('markRead returns the updated row', async () => {
    vi.mocked(repo.findById).mockResolvedValue(dom());
    vi.mocked(repo.setRead).mockResolvedValue(dom({ read: true }));
    const out = await svc.markRead(user(UserRole.ADMIN), 'fb-1');
    expect(out.read).toBe(true);
    expect(repo.setRead).toHaveBeenCalledWith('fb-1', true);
  });

  it('setRead supports toggling back to unread', async () => {
    vi.mocked(repo.findById).mockResolvedValue(dom({ read: true }));
    vi.mocked(repo.setRead).mockResolvedValue(dom({ read: false }));
    const out = await svc.setRead(user(UserRole.ADMIN), 'fb-1', false);
    expect(out.read).toBe(false);
    expect(repo.setRead).toHaveBeenCalledWith('fb-1', false);
  });

  it('markRead throws NotFound when missing', async () => {
    vi.mocked(repo.findById).mockResolvedValue(null);
    await expect(svc.markRead(user(UserRole.ADMIN), 'missing')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it('markRead throws NotFound when the post-write read fails', async () => {
    vi.mocked(repo.findById).mockResolvedValue(dom());
    vi.mocked(repo.setRead).mockResolvedValue(null);
    await expect(svc.markRead(user(UserRole.ADMIN), 'fb-1')).rejects.toBeInstanceOf(NotFoundError);
  });
});
