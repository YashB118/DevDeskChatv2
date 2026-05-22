import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'node:crypto';
import { type EntityManager } from 'typeorm';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { TransactionRunner } from '@app/infra/db/transactions';
import { UserId } from '@app/shared/types/ids';
import { UserRepository } from '@app/modules/users/user.repository';
import { type UserDomain, type UserWithCredentials } from '@app/modules/users/user.types';
import { AuthRepository, type RefreshTokenRow } from './auth.repository';
import {
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  UserDisabledError,
} from './auth.errors';
import {
  type AccessTokenResult,
  type JwtPayload,
  type LoginResult,
  type RefreshTokenIssuance,
} from './auth.types';

// Opaque refresh token wire format: `<id>.<secret>`.
// `id` lets us look up the candidate row without scanning every active token;
// `secret` is bcrypt-compared against the stored hash. Splitting this way
// keeps refresh O(1) instead of O(active tokens).
const REFRESH_TOKEN_SEPARATOR = '.';
const REFRESH_SECRET_BYTES = 48;

// Dummy bcrypt hash used to keep "no such user" timing close to the
// "bad password" branch.
const DUMMY_HASH = bcrypt.hashSync('login-timing-dummy', 12);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RefreshContext {
  ip?: string;
  userAgent?: string;
}

interface ParsedRefreshToken {
  id: string;
  secret: string;
}

export function parseRefreshToken(raw: string): ParsedRefreshToken | null {
  const idx = raw.indexOf(REFRESH_TOKEN_SEPARATOR);
  if (idx < 0) return null;
  const id = raw.slice(0, idx);
  const secret = raw.slice(idx + 1);
  if (!UUID_RE.test(id) || secret.length < 16) return null;
  return { id, secret };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly jwt: JwtService,
    private readonly users: UserRepository,
    private readonly auth: AuthRepository,
    private readonly tx: TransactionRunner,
  ) {}

  async login(email: string, password: string, ctx: RefreshContext = {}): Promise<LoginResult> {
    const normalizedEmail = email.toLowerCase();
    const user = await this.users.findByEmail(normalizedEmail);

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      await this.auth.writeAudit('auth.login.failure', null, {
        email: normalizedEmail,
        reason: 'not_found',
        ip: ctx.ip ?? null,
      });
      throw new InvalidCredentialsError();
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      await this.auth.writeAudit('auth.login.failure', user.id, {
        reason: 'bad_password',
        ip: ctx.ip ?? null,
      });
      throw new InvalidCredentialsError();
    }

    if (user.disabled) {
      await this.auth.writeAudit('auth.login.failure', user.id, {
        reason: 'disabled',
        ip: ctx.ip ?? null,
      });
      throw new UserDisabledError();
    }

    return this.tx.run<LoginResult>(async (manager) => {
      const familyId = randomUUID();
      const refresh = await this.issueRefreshToken(user.id, familyId, manager);
      const access = this.signAccessToken(user);
      await this.auth.writeAudit(
        'auth.login.success',
        user.id,
        { ip: ctx.ip ?? null, userAgent: ctx.userAgent ?? null, familyId },
        manager,
      );
      return { ...access, refresh };
    });
  }

  async refresh(presentedToken: string, ctx: RefreshContext = {}): Promise<LoginResult> {
    const parsed = parseRefreshToken(presentedToken);
    if (!parsed) {
      await this.auth.writeAudit('auth.refresh.invalid', null, { reason: 'malformed' });
      throw new InvalidRefreshTokenError();
    }

    const candidate = await this.auth.findTokenById(parsed.id);
    if (!candidate) {
      await this.auth.writeAudit('auth.refresh.invalid', null, { reason: 'not_found' });
      throw new InvalidRefreshTokenError();
    }

    const secretOk = await bcrypt.compare(parsed.secret, candidate.tokenHash);
    if (!secretOk) {
      // Wrong secret on a known id ≈ probable theft attempt; revoke family.
      await this.auth.revokeFamily(candidate.familyId);
      await this.auth.writeAudit('auth.refresh.reuse', candidate.userId, {
        reason: 'secret_mismatch',
        familyId: candidate.familyId,
      });
      throw new InvalidRefreshTokenError();
    }

    // Reuse detection must beat expiry: a replayed-but-expired token is still
    // a theft signal, and answering with `expired` instead of revoking the
    // family leaves the attacker's live token (rotated successor) in play.
    if (candidate.revoked) {
      await this.auth.revokeFamily(candidate.familyId);
      await this.auth.writeAudit('auth.refresh.reuse', candidate.userId, {
        familyId: candidate.familyId,
        ip: ctx.ip ?? null,
      });
      throw new InvalidRefreshTokenError();
    }

    if (candidate.expiresAt.getTime() <= Date.now()) {
      await this.auth.writeAudit('auth.refresh.invalid', candidate.userId, {
        reason: 'expired',
      });
      throw new InvalidRefreshTokenError();
    }

    const user = await this.users.findById(UserId(candidate.userId));
    if (!user || user.disabled) {
      await this.auth.revokeFamily(candidate.familyId);
      await this.auth.writeAudit('auth.refresh.invalid', candidate.userId, {
        reason: 'user_disabled_or_missing',
      });
      throw new InvalidRefreshTokenError();
    }

    return this.tx.run<LoginResult>(async (manager) => {
      const refresh = await this.issueRefreshToken(user.id, candidate.familyId, manager);
      await this.auth.markRotated(candidate.id, refresh.id, manager);
      const access = this.signAccessToken(user);
      await this.auth.writeAudit(
        'auth.refresh.success',
        user.id,
        { familyId: candidate.familyId, ip: ctx.ip ?? null },
        manager,
      );
      return { ...access, refresh };
    });
  }

  async logout(presentedToken: string | undefined, userId?: UserId): Promise<void> {
    if (!presentedToken) {
      if (userId) {
        await this.auth.writeAudit('auth.logout', userId, { reason: 'no_token' });
      }
      return;
    }
    const parsed = parseRefreshToken(presentedToken);
    if (!parsed) return;
    const row = await this.auth.findTokenById(parsed.id);
    if (!row) return;
    await this.auth.revokeFamily(row.familyId);
    await this.auth.writeAudit('auth.logout', row.userId, { familyId: row.familyId });
  }

  async changePassword(
    userId: UserId,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.users.findByIdWithCredentials(userId);
    if (!user) throw new InvalidCredentialsError();
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new InvalidCredentialsError();

    const newHash = await bcrypt.hash(newPassword, this.config.BCRYPT_COST);
    await this.tx.run(async (manager) => {
      await this.users.updatePasswordHash(userId, newHash, manager);
      await this.auth.revokeAllForUser(userId, manager);
      await this.auth.writeAudit('auth.password.change', userId, undefined, manager);
    });
  }

  signAccessToken(user: UserDomain | UserWithCredentials): AccessTokenResult {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = this.jwt.sign(payload, {
      algorithm: 'RS256',
      expiresIn: this.config.JWT_ACCESS_TTL_SECONDS,
      issuer: this.config.JWT_ISSUER,
      audience: this.config.JWT_AUDIENCE,
    });
    return {
      accessToken,
      accessTokenExpiresIn: this.config.JWT_ACCESS_TTL_SECONDS,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        displayName: user.displayName,
      },
    };
  }

  // Exposed for tests.
  async findRefreshTokenById(id: string): Promise<RefreshTokenRow | null> {
    return this.auth.findTokenById(id);
  }

  private async issueRefreshToken(
    userId: string,
    familyId: string,
    manager?: EntityManager,
  ): Promise<RefreshTokenIssuance> {
    const secret = randomBytes(REFRESH_SECRET_BYTES).toString('base64url');
    const tokenHash = await bcrypt.hash(secret, this.config.BCRYPT_COST);
    const expiresAt = new Date(Date.now() + this.config.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
    const row = await this.auth.insertRefreshToken(
      { userId, familyId, tokenHash, expiresAt },
      manager,
    );
    this.logger.debug(`issued refresh token ${row.id} for user ${userId}`);
    return {
      id: row.id,
      familyId: row.familyId,
      expiresAt: row.expiresAt,
      token: `${row.id}${REFRESH_TOKEN_SEPARATOR}${secret}`,
    };
  }
}
