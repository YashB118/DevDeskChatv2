import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { type UserRepository } from './user.repository';
import { type UserDomain, UserRole } from './user.types';
import { UserAlreadyExistsError, UserNotFoundError } from './users.errors';
import { type AuthRepository } from '@app/modules/auth/auth.repository';
import { type TransactionRunner } from '@app/infra/db/transactions';
import { type SocketEmitter } from '@app/realtime/socket.emitter';
import { type AppConfig } from '@app/config/env';
import { UserId } from '@app/shared/types/ids';

function userDom(over: Partial<UserDomain> = {}): UserDomain {
  return {
    id: UserId('11111111-1111-4111-8111-111111111111'),
    email: 'u@x',
    role: UserRole.DEVELOPER,
    displayName: 'Dev',
    disabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

interface Stubs {
  users: UserRepository;
  auth: AuthRepository;
  tx: TransactionRunner;
  emitter: SocketEmitter;
  cfg: AppConfig;
}

function buildStubs(): Stubs {
  return {
    users: {
      findById: vi.fn(),
      findByEmail: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      setDisabled: vi.fn(),
      updatePasswordHash: vi.fn(),
    } as unknown as UserRepository,
    auth: {
      revokeAllForUser: vi.fn(),
      writeAudit: vi.fn(),
    } as unknown as AuthRepository,
    tx: {
      run: vi.fn(async (fn: (em: unknown) => Promise<unknown>) => fn({})),
    } as unknown as TransactionRunner,
    emitter: {
      disconnectUser: vi.fn(() => undefined),
    } as unknown as SocketEmitter,
    cfg: { BCRYPT_COST: 4 } as unknown as AppConfig,
  };
}

function build(stubs: Stubs): UsersService {
  return new UsersService(stubs.cfg, stubs.users, stubs.auth, stubs.tx, stubs.emitter);
}

describe('UsersService', () => {
  let stubs: Stubs;
  let svc: UsersService;

  beforeEach(() => {
    stubs = buildStubs();
    svc = build(stubs);
  });

  it('create() rejects duplicate email', async () => {
    vi.mocked(stubs.users.findByEmail).mockResolvedValue({
      ...userDom(),
      passwordHash: 'x',
    });
    await expect(
      svc.create(
        { email: 'u@x', password: 'pw12345678', displayName: 'd', role: UserRole.DEVELOPER },
        UserId('00000000-0000-4000-8000-000000000000'),
      ),
    ).rejects.toBeInstanceOf(UserAlreadyExistsError);
  });

  it('create() hashes password, inserts row, writes audit', async () => {
    vi.mocked(stubs.users.findByEmail).mockResolvedValue(null);
    const created = userDom({ email: 'new@x' });
    vi.mocked(stubs.users.create).mockResolvedValue(created);
    const out = await svc.create(
      { email: 'NEW@X', password: 'pw12345678', displayName: 'New', role: UserRole.DEVELOPER },
      UserId('00000000-0000-4000-8000-000000000000'),
    );
    expect(stubs.users.create).toHaveBeenCalled();
    const createCall = vi.mocked(stubs.users.create).mock.calls[0]?.[0];
    expect(createCall?.email).toBe('new@x');
    expect(await bcrypt.compare('pw12345678', createCall?.passwordHash ?? '')).toBe(true);
    expect(stubs.auth.writeAudit).toHaveBeenCalledWith(
      'user.create',
      expect.any(String),
      expect.objectContaining({ targetUserId: created.id }),
      expect.anything(),
    );
    expect(out).toEqual(created);
  });

  it('setDisabled(true) revokes tokens + disconnects sockets', async () => {
    const id = UserId('22222222-2222-4222-8222-222222222222');
    vi.mocked(stubs.users.findById).mockResolvedValue(userDom({ id }));
    await svc.setDisabled(id, true, UserId('00000000-0000-4000-8000-000000000000'));
    expect(stubs.users.setDisabled).toHaveBeenCalledWith(id, true, expect.anything());
    expect(stubs.auth.revokeAllForUser).toHaveBeenCalledWith(id, expect.anything());
    expect(stubs.auth.writeAudit).toHaveBeenCalledWith(
      'user.disable',
      expect.any(String),
      { targetUserId: id },
      expect.anything(),
    );
    expect(stubs.emitter.disconnectUser).toHaveBeenCalledWith(id);
  });

  it('setDisabled(false) does NOT revoke tokens or disconnect sockets', async () => {
    const id = UserId('22222222-2222-4222-8222-222222222222');
    vi.mocked(stubs.users.findById).mockResolvedValue(userDom({ id, disabled: true }));
    await svc.setDisabled(id, false, UserId('00000000-0000-4000-8000-000000000000'));
    expect(stubs.auth.revokeAllForUser).not.toHaveBeenCalled();
    expect(stubs.emitter.disconnectUser).not.toHaveBeenCalled();
    expect(stubs.auth.writeAudit).toHaveBeenCalledWith(
      'user.enable',
      expect.any(String),
      { targetUserId: id },
      expect.anything(),
    );
  });

  it('setDisabled throws when target missing', async () => {
    vi.mocked(stubs.users.findById).mockResolvedValue(null);
    await expect(
      svc.setDisabled(UserId('22222222-2222-4222-8222-222222222222'), true, null),
    ).rejects.toBeInstanceOf(UserNotFoundError);
  });

  it('resetPassword hashes new pw, revokes families, audits, disconnects', async () => {
    const id = UserId('33333333-3333-4333-8333-333333333333');
    vi.mocked(stubs.users.findById).mockResolvedValue(userDom({ id }));
    await svc.resetPassword(id, { newPassword: 'newpw1234' }, null);
    expect(stubs.users.updatePasswordHash).toHaveBeenCalled();
    expect(stubs.auth.revokeAllForUser).toHaveBeenCalledWith(id, expect.anything());
    expect(stubs.auth.writeAudit).toHaveBeenCalledWith(
      'user.password.reset',
      null,
      { targetUserId: id },
      expect.anything(),
    );
    expect(stubs.emitter.disconnectUser).toHaveBeenCalledWith(id);
  });
});
