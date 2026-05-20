import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, In, Repository } from 'typeorm';
import { ChatMuteEntity } from './chat-mute.entity';
import { GlobalMuteEntity } from './global-mute.entity';

@Injectable()
export class MuteRepository {
  constructor(
    @InjectRepository(ChatMuteEntity)
    private readonly chatRepo: Repository<ChatMuteEntity>,
    @InjectRepository(GlobalMuteEntity)
    private readonly globalRepo: Repository<GlobalMuteEntity>,
  ) {}

  private chatScoped(manager?: EntityManager): Repository<ChatMuteEntity> {
    return manager ? manager.getRepository(ChatMuteEntity) : this.chatRepo;
  }

  private globalScoped(manager?: EntityManager): Repository<GlobalMuteEntity> {
    return manager ? manager.getRepository(GlobalMuteEntity) : this.globalRepo;
  }

  async setChatMute(
    userId: string,
    chatId: string,
    muted: boolean,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.chatScoped(manager);
    if (muted) {
      await repo
        .createQueryBuilder()
        .insert()
        .into(ChatMuteEntity)
        .values({ userId, chatId })
        .orIgnore()
        .execute();
    } else {
      await repo.delete({ userId, chatId });
    }
  }

  async isChatMuted(userId: string, chatId: string, manager?: EntityManager): Promise<boolean> {
    const row = await this.chatScoped(manager).findOne({ where: { userId, chatId } });
    return row !== null;
  }

  async mutedChatIdsForUser(userId: string, manager?: EntityManager): Promise<Set<string>> {
    const rows = await this.chatScoped(manager).find({
      where: { userId },
      select: ['chatId'],
    });
    return new Set(rows.map((r) => r.chatId));
  }

  async filterMutedChatIds(
    userId: string,
    chatIds: string[],
    manager?: EntityManager,
  ): Promise<Set<string>> {
    if (chatIds.length === 0) return new Set();
    const rows = await this.chatScoped(manager).find({
      where: { userId, chatId: In(chatIds) },
      select: ['chatId'],
    });
    return new Set(rows.map((r) => r.chatId));
  }

  async setGlobalMute(
    userId: string,
    enabled: boolean,
    manager?: EntityManager,
  ): Promise<{ userId: string; enabled: boolean; updatedAt: Date }> {
    const repo = this.globalScoped(manager);
    const existing = await repo.findOne({ where: { userId } });
    if (existing) {
      await repo.update({ userId }, { enabled });
    } else {
      await repo.insert({ userId, enabled });
    }
    const row = await repo.findOneOrFail({ where: { userId } });
    return { userId: row.userId, enabled: row.enabled, updatedAt: row.updatedAt };
  }

  async getGlobalMute(userId: string, manager?: EntityManager): Promise<boolean> {
    const row = await this.globalScoped(manager).findOne({ where: { userId } });
    return row?.enabled === true;
  }
}
