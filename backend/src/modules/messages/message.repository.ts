import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type EntityManager, In, type ObjectLiteral, Repository } from 'typeorm';
import { MessageId } from '@app/shared/types/ids';
import { MessageEntity } from './message.entity';
import { MessageReactionEntity } from './message-reaction.entity';
import { MessageEditEntity } from './message-edit.entity';
import { MessageMentionEntity } from './message-mention.entity';
import { MessageQuoteEntity } from './message-quote.entity';
import { DeletedMessageEntity } from './deleted-message.entity';
import {
  type EnrichedMessage,
  type MessageDomain,
  type MessageEditDomain,
  type MessageType,
  type QuoteDomain,
  type ReactionDomain,
} from './message.types';

function toDomain(entity: MessageEntity): MessageDomain {
  return {
    id: MessageId(entity.id),
    chatId: entity.chatId,
    stanzaId: entity.stanzaId,
    sessionId: entity.sessionId,
    fromJid: entity.fromJid,
    fromMe: entity.fromMe,
    body: entity.body,
    type: entity.type,
    rowId: entity.rowId,
    sentAt: entity.sentAt,
    createdAt: entity.createdAt,
  };
}

function reactionDomain(entity: MessageReactionEntity): ReactionDomain {
  return {
    stanzaId: entity.stanzaId,
    senderJid: entity.senderJid,
    emoji: entity.emoji,
    createdAt: entity.createdAt,
  };
}

function editDomain(entity: MessageEditEntity): MessageEditDomain {
  return {
    id: entity.id,
    stanzaId: entity.stanzaId,
    previousBody: entity.previousBody,
    newBody: entity.newBody,
    editedAt: entity.editedAt,
  };
}

function quoteDomain(entity: MessageQuoteEntity): QuoteDomain {
  return {
    stanzaId: entity.stanzaId,
    quotedStanzaId: entity.quotedStanzaId,
    quotedBody: entity.quotedBody,
  };
}

export interface UpsertMessageInput {
  id?: string;
  chatId: string;
  stanzaId: string;
  sessionId: string | null;
  fromJid: string;
  fromMe: boolean;
  body: string | null;
  type: MessageType;
  rowId: number | null;
  sentAt: Date;
}

export interface ListMessagesOptions {
  limit: number;
  beforeSentAt?: Date;
  beforeStanzaId?: string;
}

@Injectable()
export class MessageRepository {
  constructor(
    @InjectRepository(MessageEntity)
    private readonly messages: Repository<MessageEntity>,
    @InjectRepository(MessageReactionEntity)
    private readonly reactions: Repository<MessageReactionEntity>,
    @InjectRepository(MessageEditEntity)
    private readonly edits: Repository<MessageEditEntity>,
    @InjectRepository(MessageMentionEntity)
    private readonly mentions: Repository<MessageMentionEntity>,
    @InjectRepository(MessageQuoteEntity)
    private readonly quotes: Repository<MessageQuoteEntity>,
    @InjectRepository(DeletedMessageEntity)
    private readonly deletions: Repository<DeletedMessageEntity>,
  ) {}

  private scoped<E extends ObjectLiteral>(
    entity: new () => E,
    manager: EntityManager | undefined,
    fallback: Repository<E>,
  ): Repository<E> {
    return manager === undefined ? fallback : manager.getRepository(entity);
  }

  async upsert(input: UpsertMessageInput, manager?: EntityManager): Promise<MessageDomain> {
    const repo = this.scoped(MessageEntity, manager, this.messages);
    const existing = await repo.findOne({ where: { stanzaId: input.stanzaId } });
    if (existing !== null) {
      await repo.update(
        { id: existing.id, sentAt: existing.sentAt },
        {
          chatId: input.chatId,
          sessionId: input.sessionId,
          fromJid: input.fromJid,
          fromMe: input.fromMe,
          body: input.body,
          type: input.type,
          rowId: input.rowId,
        },
      );
      const reloaded = await repo.findOneOrFail({
        where: { id: existing.id, sentAt: existing.sentAt },
      });
      return toDomain(reloaded);
    }
    const row = repo.create({
      ...(input.id === undefined ? {} : { id: input.id }),
      chatId: input.chatId,
      stanzaId: input.stanzaId,
      sessionId: input.sessionId,
      fromJid: input.fromJid,
      fromMe: input.fromMe,
      body: input.body,
      type: input.type,
      rowId: input.rowId,
      sentAt: input.sentAt,
    });
    const saved = await repo.save(row);
    return toDomain(saved);
  }

  async listByChat(
    chatId: string,
    opts: ListMessagesOptions,
    manager?: EntityManager,
  ): Promise<MessageDomain[]> {
    const repo = this.scoped(MessageEntity, manager, this.messages);
    const qb = repo
      .createQueryBuilder('m')
      .where('m.chatId = :chatId', { chatId })
      .orderBy('m.sentAt', 'DESC')
      .addOrderBy('m.stanzaId', 'DESC')
      .limit(opts.limit);
    if (opts.beforeSentAt !== undefined) {
      qb.andWhere('(m.sentAt, m.stanzaId) < (:sentAt, :stanzaId)', {
        sentAt: opts.beforeSentAt,
        stanzaId: opts.beforeStanzaId ?? '',
      });
    }
    const rows = await qb.getMany();
    return rows.map(toDomain);
  }

  async findByStanzaId(stanzaId: string, manager?: EntityManager): Promise<MessageDomain | null> {
    const repo = this.scoped(MessageEntity, manager, this.messages);
    const row = await repo.findOne({ where: { stanzaId } });
    return row === null ? null : toDomain(row);
  }

  async upsertReactionToggle(
    input: ReactionDomain,
    manager?: EntityManager,
  ): Promise<{ removed: boolean }> {
    const repo = this.scoped(MessageReactionEntity, manager, this.reactions);
    const existing = await repo.findOne({
      where: { stanzaId: input.stanzaId, senderJid: input.senderJid, emoji: input.emoji },
    });
    if (existing !== null) {
      await repo.delete({
        stanzaId: input.stanzaId,
        senderJid: input.senderJid,
        emoji: input.emoji,
      });
      return { removed: true };
    }
    const row = repo.create({
      stanzaId: input.stanzaId,
      senderJid: input.senderJid,
      emoji: input.emoji,
    });
    await repo.save(row);
    return { removed: false };
  }

  async markDeleted(stanzaId: string, manager?: EntityManager): Promise<void> {
    const repo = this.scoped(DeletedMessageEntity, manager, this.deletions);
    await repo.upsert({ stanzaId }, ['stanzaId']);
  }

  async recordEdit(
    stanzaId: string,
    previousBody: string | null,
    newBody: string | null,
    manager?: EntityManager,
  ): Promise<MessageEditDomain> {
    const repo = this.scoped(MessageEditEntity, manager, this.edits);
    const row = repo.create({ stanzaId, previousBody, newBody });
    const saved = await repo.save(row);
    return editDomain(saved);
  }

  async setQuote(input: QuoteDomain, manager?: EntityManager): Promise<void> {
    const repo = this.scoped(MessageQuoteEntity, manager, this.quotes);
    await repo.upsert(
      {
        stanzaId: input.stanzaId,
        quotedStanzaId: input.quotedStanzaId,
        quotedBody: input.quotedBody,
      },
      ['stanzaId'],
    );
  }

  async setMentions(
    stanzaId: string,
    mentionedJids: string[],
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.scoped(MessageMentionEntity, manager, this.mentions);
    await repo.delete({ stanzaId });
    if (mentionedJids.length === 0) return;
    await repo.save(mentionedJids.map((jid) => repo.create({ stanzaId, mentionedJid: jid })));
  }

  /**
   * Loads reactions / quotes / edits / mentions / deletion flags for a batch
   * of stanza IDs in parallel. Avoids eager TypeORM relations because the
   * children point at `stanza_id`, not the messages PK (the partitioned
   * parent has no enforceable FK target).
   */
  async enrich(messages: MessageDomain[], manager?: EntityManager): Promise<EnrichedMessage[]> {
    if (messages.length === 0) return [];
    const stanzaIds = messages.map((m) => m.stanzaId);
    const reactionRepo = this.scoped(MessageReactionEntity, manager, this.reactions);
    const editRepo = this.scoped(MessageEditEntity, manager, this.edits);
    const quoteRepo = this.scoped(MessageQuoteEntity, manager, this.quotes);
    const mentionRepo = this.scoped(MessageMentionEntity, manager, this.mentions);
    const deletionRepo = this.scoped(DeletedMessageEntity, manager, this.deletions);

    const [reactions, edits, quotes, mentions, deletions] = await Promise.all([
      reactionRepo.find({ where: { stanzaId: In(stanzaIds) } }),
      editRepo.find({ where: { stanzaId: In(stanzaIds) }, order: { editedAt: 'DESC' } }),
      quoteRepo.find({ where: { stanzaId: In(stanzaIds) } }),
      mentionRepo.find({ where: { stanzaId: In(stanzaIds) } }),
      deletionRepo.find({ where: { stanzaId: In(stanzaIds) } }),
    ]);

    const byStanza = <T extends { stanzaId: string }>(rows: T[]): Map<string, T[]> => {
      const acc = new Map<string, T[]>();
      for (const row of rows) {
        const arr = acc.get(row.stanzaId) ?? [];
        arr.push(row);
        acc.set(row.stanzaId, arr);
      }
      return acc;
    };

    const reactionsByStanza = byStanza(reactions);
    const editsByStanza = byStanza(edits);
    const mentionsByStanza = byStanza(mentions);
    const quoteByStanza = new Map(quotes.map((q) => [q.stanzaId, q]));
    const deletedSet = new Set(deletions.map((d) => d.stanzaId));

    return messages.map((msg) => ({
      ...msg,
      reactions: (reactionsByStanza.get(msg.stanzaId) ?? []).map(reactionDomain),
      edits: (editsByStanza.get(msg.stanzaId) ?? []).map(editDomain),
      mentions: (mentionsByStanza.get(msg.stanzaId) ?? []).map((m) => m.mentionedJid),
      quote: ((): QuoteDomain | null => {
        const q = quoteByStanza.get(msg.stanzaId);
        return q === undefined ? null : quoteDomain(q);
      })(),
      deleted: deletedSet.has(msg.stanzaId),
    }));
  }
}
