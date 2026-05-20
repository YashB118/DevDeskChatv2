import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { UserId } from '@app/shared/types/ids';
import { UserEntity } from './user.entity';
import { type UserDomain, type UserRole, type UserWithCredentials } from './user.types';

function toDomain(entity: UserEntity): UserDomain {
  return {
    id: UserId(entity.id),
    email: entity.email,
    role: entity.role,
    displayName: entity.displayName,
    disabled: entity.disabled,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

function toDomainWithCredentials(entity: UserEntity): UserWithCredentials {
  return { ...toDomain(entity), passwordHash: entity.passwordHash };
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  role: UserRole;
  displayName: string;
}

@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
  ) {}

  private scoped(manager?: EntityManager): Repository<UserEntity> {
    return manager ? manager.getRepository(UserEntity) : this.repo;
  }

  async findById(id: UserId, manager?: EntityManager): Promise<UserDomain | null> {
    const row = await this.scoped(manager).findOne({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByIdWithCredentials(
    id: UserId,
    manager?: EntityManager,
  ): Promise<UserWithCredentials | null> {
    const row = await this.scoped(manager).findOne({ where: { id } });
    return row ? toDomainWithCredentials(row) : null;
  }

  async findByEmail(email: string, manager?: EntityManager): Promise<UserWithCredentials | null> {
    const row = await this.scoped(manager).findOne({
      where: { email: email.toLowerCase() },
    });
    return row ? toDomainWithCredentials(row) : null;
  }

  async create(input: CreateUserInput, manager?: EntityManager): Promise<UserDomain> {
    const repo = this.scoped(manager);
    const row = repo.create({
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      role: input.role,
      displayName: input.displayName,
    });
    const saved = await repo.save(row);
    return toDomain(saved);
  }

  async updatePasswordHash(
    id: UserId,
    passwordHash: string,
    manager?: EntityManager,
  ): Promise<void> {
    await this.scoped(manager).update({ id }, { passwordHash });
  }

  async upsertByEmail(input: CreateUserInput, manager?: EntityManager): Promise<UserDomain> {
    const repo = this.scoped(manager);
    const email = input.email.toLowerCase();
    const existing = await repo.findOne({ where: { email } });
    if (existing) {
      await repo.update(
        { id: existing.id },
        {
          passwordHash: input.passwordHash,
          role: input.role,
          displayName: input.displayName,
        },
      );
      const reloaded = await repo.findOneOrFail({ where: { id: existing.id } });
      return toDomain(reloaded);
    }
    return this.create(input, manager);
  }
}
