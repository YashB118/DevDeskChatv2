import { describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcrypt';
import { type JwtService } from '@nestjs/jwt';
import { type AppConfig } from '@app/config/env';
import { type TransactionRunner } from '@app/infra/db/transactions';
import { UserId } from '@app/shared/types/ids';
import { UserRole, type UserWithCredentials } from '@app/modules/users/user.types';
import { AuthService, parseRefreshToken } from './auth.service';
import { type RefreshTokenRow } from './auth.repository';
import {
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  UserDisabledError,
} from './auth.errors';

const TEST_BCRYPT_COST = 4;

function makeConfig(): AppConfig {
  return {
    JWT_PRIVATE_KEY: 'dummy-private-key',
    JWT_PUBLIC_KEY: 'dummy-public-key',
    JWT_ACCESS_TTL_SECONDS: 900,
    JWT_ISSUER: 'test-iss',
    JWT_AUDIENCE: 'test-aud',
    REFRESH_TTL_DAYS: 30,
    REFRESH_COOKIE_NAME: 'dd_refresh',
    REFRESH_COOKIE_PATH: '/api/auth',
    REFRESH_COOKIE_SECURE: false,
    BCRYPT_COST: TEST_BCRYPT_COST,
  } as unknown as AppConfig;
}

function makeJwt(): JwtService {
  return {
    sign: vi.fn().mockReturnValue('signed.jwt.token'),
    verifyAsync: vi.fn(),
  } as unknown as JwtService;
}

interface InMemoryAuthRepoState {
  tokens: Map<string, RefreshTokenRow>;
  audits: {
    event: string;
    userId: string | null;
    payload: Record<string, unknown> | undefined;
  }[];
}

function makeAuthRepo(state: InMemoryAuthRepoState) {
  let idCounter = 0;
  return {
    insertRefreshToken: vi.fn(
      async (input: { userId: string; familyId: string; tokenHash: string; expiresAt: Date }) => {
        idCounter += 1;
        const id = `00000000-0000-4000-8000-${idCounter.toString().padStart(12, '0')}`;
        const row: RefreshTokenRow = {
          id,
          userId: input.userId,
          familyId: input.familyId,
          tokenHash: input.tokenHash,
          issuedAt: new Date(),
          expiresAt: input.expiresAt,
          replacedBy: null,
          revoked: false,
        };
        state.tokens.set(id, row);
        return row;
      },
    ),
    findTokenById: vi.fn(async (id: string) => state.tokens.get(id) ?? null),
    markRotated: vi.fn(async (oldId: string, newId: string) => {
      const row = state.tokens.get(oldId);
      if (row) state.tokens.set(oldId, { ...row, revoked: true, replacedBy: newId });
    }),
    revokeFamily: vi.fn(async (familyId: string) => {
      for (const [id, row] of state.tokens) {
        if (row.familyId === familyId) state.tokens.set(id, { ...row, revoked: true });
      }
    }),
    revokeAllForUser: vi.fn(async (userId: string) => {
      for (const [id, row] of state.tokens) {
        if (row.userId === userId) state.tokens.set(id, { ...row, revoked: true });
      }
    }),
    markRevoked: vi.fn(async (id: string) => {
      const row = state.tokens.get(id);
      if (row) state.tokens.set(id, { ...row, revoked: true });
    }),
    listFamilyTokens: vi.fn(async (familyId: string) => {
      return Array.from(state.tokens.values()).filter((r) => r.familyId === familyId);
    }),
    purgeExpired: vi.fn(async () => undefined),
    writeAudit: vi.fn(
      async (event: string, userId: string | null, payload?: Record<string, unknown>) => {
        state.audits.push({ event, userId, payload });
      },
    ),
  };
}

function makeUserRepo(users: Map<string, UserWithCredentials>) {
  return {
    findByEmail: vi.fn(async (email: string) => {
      for (const u of users.values()) {
        if (u.email.toLowerCase() === email.toLowerCase()) return u;
      }
      return null;
    }),
    findById: vi.fn(async (id: string) => users.get(id) ?? null),
    findByIdWithCredentials: vi.fn(async (id: string) => users.get(id) ?? null),
    updatePasswordHash: vi.fn(async (id: string, passwordHash: string) => {
      const u = users.get(id);
      if (u) users.set(id, { ...u, passwordHash });
    }),
    create: vi.fn(),
    upsertByEmail: vi.fn(),
  };
}

function makeTx(): TransactionRunner {
  return {
    run: vi.fn(async (fn: (m: unknown) => Promise<unknown>) => fn({})),
  } as unknown as TransactionRunner;
}

async function makeUser(
  overrides: Partial<UserWithCredentials> = {},
): Promise<UserWithCredentials> {
  const passwordHash = await bcrypt.hash('hunter2hunter', TEST_BCRYPT_COST);
  return {
    id: UserId('11111111-1111-4111-8111-111111111111'),
    email: 'alice@example.com',
    role: UserRole.ADMIN,
    displayName: 'Alice',
    disabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    passwordHash,
    ...overrides,
  };
}

function buildService() {
  const state: InMemoryAuthRepoState = { tokens: new Map(), audits: [] };
  const users = new Map<string, UserWithCredentials>();
  const authRepo = makeAuthRepo(state);
  const userRepo = makeUserRepo(users);
  const jwt = makeJwt();
  const tx = makeTx();
  const config = makeConfig();
  const service = new AuthService(config, jwt, userRepo as never, authRepo as never, tx);
  return { service, state, users, authRepo, userRepo, jwt, tx, config };
}

describe('parseRefreshToken', () => {
  it('returns null for malformed input', () => {
    expect(parseRefreshToken('no-separator')).toBeNull();
    expect(parseRefreshToken('not-a-uuid.somesecretsomesecret')).toBeNull();
    expect(parseRefreshToken('11111111-1111-4111-8111-111111111111.short')).toBeNull();
  });

  it('parses valid token shape', () => {
    const token = '11111111-1111-4111-8111-111111111111.abcdefghijklmnop';
    const parsed = parseRefreshToken(token);
    expect(parsed?.id).toBe('11111111-1111-4111-8111-111111111111');
    expect(parsed?.secret).toBe('abcdefghijklmnop');
  });
});

describe('AuthService.login', () => {
  it('issues access + refresh and writes success audit', async () => {
    const { service, users, state } = buildService();
    const user = await makeUser();
    users.set(user.id, user);

    const result = await service.login('alice@example.com', 'hunter2hunter');

    expect(result.accessToken).toBe('signed.jwt.token');
    expect(result.user.email).toBe('alice@example.com');
    expect(result.refresh.token).toContain('.');
    expect(state.tokens.size).toBe(1);
    expect(state.audits.some((a) => a.event === 'auth.login.success')).toBe(true);
  });

  it('throws InvalidCredentials on unknown email and audits failure', async () => {
    const { service, state } = buildService();
    await expect(service.login('nobody@example.com', 'whatever12')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
    expect(state.audits.find((a) => a.event === 'auth.login.failure')).toBeDefined();
  });

  it('throws InvalidCredentials on wrong password', async () => {
    const { service, users } = buildService();
    const user = await makeUser();
    users.set(user.id, user);
    await expect(service.login(user.email, 'wrongpassword')).rejects.toBeInstanceOf(
      InvalidCredentialsError,
    );
  });

  it('throws UserDisabled when account is disabled', async () => {
    const { service, users } = buildService();
    const user = await makeUser({ disabled: true });
    users.set(user.id, user);
    await expect(service.login(user.email, 'hunter2hunter')).rejects.toBeInstanceOf(
      UserDisabledError,
    );
  });
});

describe('AuthService.refresh — rotation', () => {
  it('rotates token, revokes the old row, keeps family stable', async () => {
    const { service, users, state } = buildService();
    const user = await makeUser();
    users.set(user.id, user);
    const login = await service.login(user.email, 'hunter2hunter');

    const refreshed = await service.refresh(login.refresh.token);

    expect(refreshed.refresh.familyId).toBe(login.refresh.familyId);
    expect(refreshed.refresh.id).not.toBe(login.refresh.id);
    const oldRow = state.tokens.get(login.refresh.id);
    expect(oldRow?.revoked).toBe(true);
    expect(oldRow?.replacedBy).toBe(refreshed.refresh.id);
    expect(state.audits.some((a) => a.event === 'auth.refresh.success')).toBe(true);
  });
});

describe('AuthService.refresh — reuse detection', () => {
  it('revokes the whole family when an already-rotated token is replayed', async () => {
    const { service, users, state } = buildService();
    const user = await makeUser();
    users.set(user.id, user);
    const login = await service.login(user.email, 'hunter2hunter');
    const rotated = await service.refresh(login.refresh.token);

    await expect(service.refresh(login.refresh.token)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );

    const familyRows = Array.from(state.tokens.values()).filter(
      (r) => r.familyId === login.refresh.familyId,
    );
    expect(familyRows.every((r) => r.revoked)).toBe(true);
    expect(rotated.refresh.familyId).toBe(login.refresh.familyId);
    expect(state.audits.some((a) => a.event === 'auth.refresh.reuse')).toBe(true);
  });

  it('revokes family when a known id is presented with a wrong secret', async () => {
    const { service, users, state } = buildService();
    const user = await makeUser();
    users.set(user.id, user);
    const login = await service.login(user.email, 'hunter2hunter');

    const tampered = `${login.refresh.id}.this_is_a_wrong_secret_long_enough`;
    await expect(service.refresh(tampered)).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    const familyRows = Array.from(state.tokens.values()).filter(
      (r) => r.familyId === login.refresh.familyId,
    );
    expect(familyRows.every((r) => r.revoked)).toBe(true);
  });

  it('rejects malformed refresh tokens without touching audit user_id', async () => {
    const { service, state } = buildService();
    await expect(service.refresh('garbage')).rejects.toBeInstanceOf(InvalidRefreshTokenError);
    const audit = state.audits.find((a) => a.event === 'auth.refresh.invalid');
    expect(audit?.userId).toBeNull();
  });

  it('rejects unknown token ids', async () => {
    const { service } = buildService();
    await expect(
      service.refresh('00000000-0000-4000-8000-000000000099.somelongsecretsecret'),
    ).rejects.toBeInstanceOf(InvalidRefreshTokenError);
  });

  it('rejects expired tokens', async () => {
    const { service, users, state } = buildService();
    const user = await makeUser();
    users.set(user.id, user);
    const login = await service.login(user.email, 'hunter2hunter');

    // Backdate expiry on the issued row.
    const row = state.tokens.get(login.refresh.id);
    if (!row) throw new Error('token row missing');
    state.tokens.set(login.refresh.id, { ...row, expiresAt: new Date(Date.now() - 1000) });

    await expect(service.refresh(login.refresh.token)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError,
    );
  });
});

describe('AuthService.changePassword', () => {
  it('updates the hash, revokes all refresh tokens, audits the change', async () => {
    const { service, users, state } = buildService();
    const user = await makeUser();
    users.set(user.id, user);
    const login = await service.login(user.email, 'hunter2hunter');

    await service.changePassword(user.id, 'hunter2hunter', 'newpassword123');

    const refreshed = users.get(user.id);
    expect(refreshed?.passwordHash).not.toBe(user.passwordHash);
    expect(await bcrypt.compare('newpassword123', refreshed!.passwordHash)).toBe(true);
    const row = state.tokens.get(login.refresh.id);
    expect(row?.revoked).toBe(true);
    expect(state.audits.some((a) => a.event === 'auth.password.change')).toBe(true);
  });

  it('rejects when current password is wrong', async () => {
    const { service, users } = buildService();
    const user = await makeUser();
    users.set(user.id, user);
    await expect(
      service.changePassword(user.id, 'wrong-current', 'newpassword123'),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});

describe('AuthService.logout', () => {
  it('revokes the family the presented token belongs to', async () => {
    const { service, users, state } = buildService();
    const user = await makeUser();
    users.set(user.id, user);
    const login = await service.login(user.email, 'hunter2hunter');

    await service.logout(login.refresh.token, user.id);

    const row = state.tokens.get(login.refresh.id);
    expect(row?.revoked).toBe(true);
    expect(state.audits.some((a) => a.event === 'auth.logout')).toBe(true);
  });

  it('is a no-op when no token cookie is present', async () => {
    const { service, state } = buildService();
    await service.logout(undefined);
    expect(state.audits).toEqual([]);
  });
});
