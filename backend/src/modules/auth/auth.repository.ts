import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, IsNull, LessThan, Repository } from 'typeorm';
import { RefreshTokenEntity } from './refresh-token.entity';
import { AuditLogEntity } from './audit-log.entity';
import { type AuditEvent } from './auth.types';

export interface RefreshTokenRow {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  replacedBy: string | null;
  revoked: boolean;
}

export interface InsertRefreshTokenInput {
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
}

@Injectable()
export class AuthRepository {
  constructor(
    @InjectRepository(RefreshTokenEntity)
    private readonly refreshRepo: Repository<RefreshTokenEntity>,
    @InjectRepository(AuditLogEntity)
    private readonly auditRepo: Repository<AuditLogEntity>,
  ) {}

  private refreshScoped(manager?: EntityManager): Repository<RefreshTokenEntity> {
    return manager ? manager.getRepository(RefreshTokenEntity) : this.refreshRepo;
  }

  private auditScoped(manager?: EntityManager): Repository<AuditLogEntity> {
    return manager ? manager.getRepository(AuditLogEntity) : this.auditRepo;
  }

  async insertRefreshToken(
    input: InsertRefreshTokenInput,
    manager?: EntityManager,
  ): Promise<RefreshTokenRow> {
    const repo = this.refreshScoped(manager);
    const row = repo.create({
      userId: input.userId,
      familyId: input.familyId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      replacedBy: null,
      revoked: false,
    });
    const saved = await repo.save(row);
    return this.toRow(saved);
  }

  async listFamilyTokens(familyId: string, manager?: EntityManager): Promise<RefreshTokenRow[]> {
    const rows = await this.refreshScoped(manager).find({
      where: { familyId },
      order: { issuedAt: 'ASC' },
    });
    return rows.map((r) => this.toRow(r));
  }

  async findTokenById(id: string, manager?: EntityManager): Promise<RefreshTokenRow | null> {
    const row = await this.refreshScoped(manager).findOne({ where: { id } });
    return row ? this.toRow(row) : null;
  }

  async markRevoked(id: string, manager?: EntityManager): Promise<void> {
    await this.refreshScoped(manager).update({ id }, { revoked: true });
  }

  async markRotated(oldId: string, newId: string, manager?: EntityManager): Promise<void> {
    await this.refreshScoped(manager).update({ id: oldId }, { revoked: true, replacedBy: newId });
  }

  async revokeFamily(familyId: string, manager?: EntityManager): Promise<void> {
    await this.refreshScoped(manager).update({ familyId, revoked: false }, { revoked: true });
  }

  async revokeAllForUser(userId: string, manager?: EntityManager): Promise<void> {
    await this.refreshScoped(manager).update({ userId, revoked: false }, { revoked: true });
  }

  async purgeExpired(now: Date, manager?: EntityManager): Promise<void> {
    await this.refreshScoped(manager).delete({
      expiresAt: LessThan(now),
      replacedBy: IsNull(),
    });
  }

  async writeAudit(
    event: AuditEvent,
    userId: string | null,
    payload?: Record<string, unknown>,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.auditScoped(manager);
    const entity = repo.create({
      userId,
      event,
      payload: payload ?? null,
    });
    await repo.save(entity);
  }

  private toRow(entity: RefreshTokenEntity): RefreshTokenRow {
    return {
      id: entity.id,
      userId: entity.userId,
      familyId: entity.familyId,
      tokenHash: entity.tokenHash,
      issuedAt: entity.issuedAt,
      expiresAt: entity.expiresAt,
      replacedBy: entity.replacedBy,
      revoked: entity.revoked,
    };
  }
}
