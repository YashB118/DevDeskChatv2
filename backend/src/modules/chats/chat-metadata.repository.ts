import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, Repository } from 'typeorm';
import { ChatMetadataEntity } from './chat-metadata.entity';

export interface ChatMetadataDomain {
  chatId: string;
  displayNameOverride: string | null;
  lastSeenAt: Date | null;
  updatedAt: Date;
}

function toDomain(entity: ChatMetadataEntity): ChatMetadataDomain {
  return {
    chatId: entity.chatId,
    displayNameOverride: entity.displayNameOverride,
    lastSeenAt: entity.lastSeenAt,
    updatedAt: entity.updatedAt,
  };
}

@Injectable()
export class ChatMetadataRepository {
  constructor(
    @InjectRepository(ChatMetadataEntity)
    private readonly repo: Repository<ChatMetadataEntity>,
  ) {}

  private scoped(manager?: EntityManager): Repository<ChatMetadataEntity> {
    return manager === undefined ? this.repo : manager.getRepository(ChatMetadataEntity);
  }

  async findByChatId(chatId: string, manager?: EntityManager): Promise<ChatMetadataDomain | null> {
    const row = await this.scoped(manager).findOne({ where: { chatId } });
    return row === null ? null : toDomain(row);
  }

  async setLastSeen(chatId: string, when: Date, manager?: EntityManager): Promise<void> {
    const repo = this.scoped(manager);
    await repo.upsert({ chatId, lastSeenAt: when }, ['chatId']);
  }

  async setDisplayNameOverride(
    chatId: string,
    override: string | null,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.scoped(manager);
    await repo.upsert({ chatId, displayNameOverride: override }, ['chatId']);
  }
}
