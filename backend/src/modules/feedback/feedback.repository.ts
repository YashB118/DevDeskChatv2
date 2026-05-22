import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { FeedbackEntity } from './feedback.entity';
import { type FeedbackDomain } from './feedback.types';

function toDomain(entity: FeedbackEntity): FeedbackDomain {
  return {
    id: entity.id,
    userId: entity.userId,
    body: entity.body,
    read: entity.read,
    createdAt: entity.createdAt,
  };
}

export interface ListFeedbackOptions {
  userId?: string;
  unreadOnly?: boolean;
  limit?: number;
}

@Injectable()
export class FeedbackRepository {
  constructor(
    @InjectRepository(FeedbackEntity)
    private readonly repo: Repository<FeedbackEntity>,
  ) {}

  private scoped(manager?: EntityManager): Repository<FeedbackEntity> {
    return manager ? manager.getRepository(FeedbackEntity) : this.repo;
  }

  async insert(
    input: { userId: string | null; body: string },
    manager?: EntityManager,
  ): Promise<FeedbackDomain> {
    const repo = this.scoped(manager);
    const entity = repo.create({ userId: input.userId, body: input.body });
    const saved = await repo.save(entity);
    return toDomain(saved);
  }

  async list(options: ListFeedbackOptions, manager?: EntityManager): Promise<FeedbackDomain[]> {
    const qb = this.scoped(manager).createQueryBuilder('f');
    if (options.userId !== undefined) qb.andWhere('f.userId = :u', { u: options.userId });
    if (options.unreadOnly === true) qb.andWhere('f.read = false');
    qb.orderBy('f.createdAt', 'DESC');
    if (options.limit !== undefined) qb.limit(options.limit);
    const rows = await qb.getMany();
    return rows.map(toDomain);
  }

  async findById(id: string, manager?: EntityManager): Promise<FeedbackDomain | null> {
    const row = await this.scoped(manager).findOne({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async markRead(id: string, manager?: EntityManager): Promise<FeedbackDomain | null> {
    return this.setRead(id, true, manager);
  }

  async setRead(
    id: string,
    read: boolean,
    manager?: EntityManager,
  ): Promise<FeedbackDomain | null> {
    const repo = this.scoped(manager);
    await repo.update({ id }, { read });
    const row = await repo.findOne({ where: { id } });
    return row ? toDomain(row) : null;
  }
}
