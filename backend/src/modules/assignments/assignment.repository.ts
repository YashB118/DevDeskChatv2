import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { AssignmentEvent, AssignmentHistoryEntity } from './assignment-history.entity';
import { DeveloperAssignmentEntity } from './developer-assignment.entity';
import { type AssignmentDomain, type AssignmentHistoryDomain } from './assignment.types';

function toDomain(entity: DeveloperAssignmentEntity): AssignmentDomain {
  return {
    id: entity.id,
    userId: entity.userId,
    chatId: entity.chatId,
    wahaSessionId: entity.wahaSessionId,
    assignedBy: entity.assignedBy,
    assignedAt: entity.assignedAt,
    unassignedAt: entity.unassignedAt,
    isActive: entity.isActive,
  };
}

function toHistoryDomain(entity: AssignmentHistoryEntity): AssignmentHistoryDomain {
  return {
    id: entity.id,
    assignmentId: entity.assignmentId,
    event: entity.event,
    actorId: entity.actorId,
    payload: entity.payload,
    occurredAt: entity.occurredAt,
  };
}

export interface InsertAssignmentInput {
  userId: string;
  chatId: string;
  wahaSessionId: string | null;
  assignedBy: string | null;
}

@Injectable()
export class AssignmentRepository {
  constructor(
    @InjectRepository(DeveloperAssignmentEntity)
    private readonly repo: Repository<DeveloperAssignmentEntity>,
    @InjectRepository(AssignmentHistoryEntity)
    private readonly historyRepo: Repository<AssignmentHistoryEntity>,
  ) {}

  private scoped(manager?: EntityManager): Repository<DeveloperAssignmentEntity> {
    return manager ? manager.getRepository(DeveloperAssignmentEntity) : this.repo;
  }

  private historyScoped(manager?: EntityManager): Repository<AssignmentHistoryEntity> {
    return manager ? manager.getRepository(AssignmentHistoryEntity) : this.historyRepo;
  }

  async findActive(
    userId: string,
    chatId: string,
    manager?: EntityManager,
  ): Promise<AssignmentDomain | null> {
    const row = await this.scoped(manager).findOne({
      where: { userId, chatId, isActive: true },
    });
    return row ? toDomain(row) : null;
  }

  async findById(id: string, manager?: EntityManager): Promise<AssignmentDomain | null> {
    const row = await this.scoped(manager).findOne({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async insert(input: InsertAssignmentInput, manager?: EntityManager): Promise<AssignmentDomain> {
    const repo = this.scoped(manager);
    const entity = repo.create({
      userId: input.userId,
      chatId: input.chatId,
      wahaSessionId: input.wahaSessionId,
      assignedBy: input.assignedBy,
      isActive: true,
    });
    const saved = await repo.save(entity);
    return toDomain(saved);
  }

  async deactivate(id: string, manager?: EntityManager): Promise<AssignmentDomain | null> {
    const repo = this.scoped(manager);
    await repo.update({ id }, { isActive: false, unassignedAt: new Date() });
    const row = await repo.findOne({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async listActiveChatIdsForUser(userId: string, manager?: EntityManager): Promise<string[]> {
    const rows = await this.scoped(manager).find({
      where: { userId, isActive: true },
      select: ['chatId'],
    });
    return rows.map((r) => r.chatId);
  }

  async listActiveByChatId(chatId: string, manager?: EntityManager): Promise<AssignmentDomain[]> {
    const rows = await this.scoped(manager).find({
      where: { chatId, isActive: true },
      order: { assignedAt: 'DESC' },
    });
    return rows.map(toDomain);
  }

  async listAll(
    options: { userId?: string; chatId?: string; activeOnly?: boolean; limit?: number } = {},
    manager?: EntityManager,
  ): Promise<AssignmentDomain[]> {
    const qb = this.scoped(manager).createQueryBuilder('a');
    if (options.userId !== undefined) qb.andWhere('a.userId = :u', { u: options.userId });
    if (options.chatId !== undefined) qb.andWhere('a.chatId = :c', { c: options.chatId });
    if (options.activeOnly === true) qb.andWhere('a.isActive = true');
    qb.orderBy('a.assignedAt', 'DESC');
    if (options.limit !== undefined) qb.limit(options.limit);
    const rows = await qb.getMany();
    return rows.map(toDomain);
  }

  async writeHistory(
    input: {
      assignmentId: string;
      event: AssignmentEvent;
      actorId: string | null;
      payload: Record<string, unknown> | null;
    },
    manager?: EntityManager,
  ): Promise<AssignmentHistoryDomain> {
    const repo = this.historyScoped(manager);
    const entity = repo.create({
      assignmentId: input.assignmentId,
      event: input.event,
      actorId: input.actorId,
      payload: input.payload,
    });
    const saved = await repo.save(entity);
    return toHistoryDomain(saved);
  }

  async listHistoryFor(
    assignmentId: string,
    manager?: EntityManager,
  ): Promise<AssignmentHistoryDomain[]> {
    const rows = await this.historyScoped(manager).find({
      where: { assignmentId },
      order: { occurredAt: 'DESC' },
    });
    return rows.map(toHistoryDomain);
  }
}
