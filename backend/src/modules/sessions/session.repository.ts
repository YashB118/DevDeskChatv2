import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, type QueryDeepPartialEntity, Repository } from 'typeorm';
import { SessionId } from '@app/shared/types/ids';
import { SessionEntity } from './session.entity';
import { type SessionDomain, type SessionStatus } from './session.types';

function toDomain(entity: SessionEntity): SessionDomain {
  return {
    id: SessionId(entity.id),
    name: entity.name,
    status: entity.status,
    config: entity.config,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  };
}

export interface UpsertSessionInput {
  name: string;
  status: SessionStatus;
  config?: Record<string, unknown> | null;
}

@Injectable()
export class SessionRepository {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly repo: Repository<SessionEntity>,
  ) {}

  private scoped(manager?: EntityManager): Repository<SessionEntity> {
    return manager ? manager.getRepository(SessionEntity) : this.repo;
  }

  async list(manager?: EntityManager): Promise<SessionDomain[]> {
    const rows = await this.scoped(manager).find({ order: { createdAt: 'ASC' } });
    return rows.map(toDomain);
  }

  async findByName(name: string, manager?: EntityManager): Promise<SessionDomain | null> {
    const row = await this.scoped(manager).findOne({ where: { name } });
    return row === null ? null : toDomain(row);
  }

  async findById(id: SessionId, manager?: EntityManager): Promise<SessionDomain | null> {
    const row = await this.scoped(manager).findOne({ where: { id } });
    return row === null ? null : toDomain(row);
  }

  async upsertByName(input: UpsertSessionInput, manager?: EntityManager): Promise<SessionDomain> {
    const repo = this.scoped(manager);
    const existing = await repo.findOne({ where: { name: input.name } });
    if (existing !== null) {
      const nextConfig = input.config ?? existing.config;
      const patch = {
        status: input.status,
        config: nextConfig,
      } as QueryDeepPartialEntity<SessionEntity>;
      await repo.update({ id: existing.id }, patch);
      const reloaded = await repo.findOneOrFail({ where: { id: existing.id } });
      return toDomain(reloaded);
    }
    const row = repo.create({
      name: input.name,
      status: input.status,
      config: input.config ?? null,
    });
    const saved = await repo.save(row);
    return toDomain(saved);
  }

  async updateStatus(name: string, status: SessionStatus, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).update({ name }, { status });
  }

  async deleteByName(name: string, manager?: EntityManager): Promise<void> {
    await this.scoped(manager).delete({ name });
  }
}
