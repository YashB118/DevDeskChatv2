import { Inject, Injectable, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { TransactionRunner } from '@app/infra/db/transactions';
import { UserId } from '@app/shared/types/ids';
import { AuthRepository } from '@app/modules/auth/auth.repository';
import { SocketEmitter } from '@app/realtime/socket.emitter';
import {
  UserRepository,
  type ListUsersOptions,
  type UpdateUserInput as UpdateUserRepoInput,
} from './user.repository';
import { type UserDomain } from './user.types';
import {
  type AdminPasswordResetInput,
  type CreateUserInput,
  type UpdateUserInput,
} from './users.schema';
import { UserAlreadyExistsError, UserNotFoundError } from './users.errors';

function toRepoPatch(input: UpdateUserInput): UpdateUserRepoInput {
  const patch: UpdateUserRepoInput = {};
  if (input.displayName !== undefined) patch.displayName = input.displayName;
  if (input.role !== undefined) patch.role = input.role;
  return patch;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly users: UserRepository,
    private readonly auth: AuthRepository,
    private readonly tx: TransactionRunner,
    private readonly emitter: SocketEmitter,
  ) {}

  list(options: ListUsersOptions = {}): Promise<UserDomain[]> {
    return this.users.list(options);
  }

  async get(id: UserId): Promise<UserDomain> {
    const user = await this.users.findById(id);
    if (user === null) throw new UserNotFoundError(id);
    return user;
  }

  async create(input: CreateUserInput, actorId: UserId | null): Promise<UserDomain> {
    const normalizedEmail = input.email.toLowerCase();
    const existing = await this.users.findByEmail(normalizedEmail);
    if (existing) throw new UserAlreadyExistsError(normalizedEmail);
    const passwordHash = await bcrypt.hash(input.password, this.config.BCRYPT_COST);
    return this.tx.run(async (em) => {
      const created = await this.users.create(
        {
          email: normalizedEmail,
          passwordHash,
          role: input.role,
          displayName: input.displayName,
        },
        em,
      );
      await this.auth.writeAudit(
        'user.create',
        actorId,
        { targetUserId: created.id, email: normalizedEmail, role: input.role },
        em,
      );
      return created;
    });
  }

  async update(id: UserId, input: UpdateUserInput, actorId: UserId | null): Promise<UserDomain> {
    const patch = toRepoPatch(input);
    return this.tx.run(async (em) => {
      const updated = await this.users.update(id, patch, em);
      if (updated === null) throw new UserNotFoundError(id);
      await this.auth.writeAudit('user.update', actorId, { targetUserId: id, changes: patch }, em);
      return updated;
    });
  }

  async setDisabled(id: UserId, disabled: boolean, actorId: UserId | null): Promise<UserDomain> {
    const user = await this.users.findById(id);
    if (user === null) throw new UserNotFoundError(id);

    const updated = await this.tx.run(async (em) => {
      await this.users.setDisabled(id, disabled, em);
      if (disabled) {
        // Sever the user's existing JWT sessions; the access token remains
        // signature-valid until expiry but no new pair can be issued.
        await this.auth.revokeAllForUser(id, em);
      }
      await this.auth.writeAudit(
        disabled ? 'user.disable' : 'user.enable',
        actorId,
        { targetUserId: id },
        em,
      );
      return this.users.findById(id, em);
    });
    if (updated === null) throw new UserNotFoundError(id);

    if (disabled) {
      // Done outside the transaction so a socket-server hiccup never aborts
      // the persistent state flip. Best-effort disconnect; the next access
      // token issuance is already barred by `disabled = true`.
      this.emitter.disconnectUser(id);
    }
    return updated;
  }

  async resetPassword(
    id: UserId,
    input: AdminPasswordResetInput,
    actorId: UserId | null,
  ): Promise<void> {
    const user = await this.users.findById(id);
    if (user === null) throw new UserNotFoundError(id);
    const passwordHash = await bcrypt.hash(input.newPassword, this.config.BCRYPT_COST);
    await this.tx.run(async (em) => {
      await this.users.updatePasswordHash(id, passwordHash, em);
      await this.auth.revokeAllForUser(id, em);
      await this.auth.writeAudit('user.password.reset', actorId, { targetUserId: id }, em);
    });
    // Force any active sockets off — the user must re-authenticate.
    this.emitter.disconnectUser(id);
  }
}
