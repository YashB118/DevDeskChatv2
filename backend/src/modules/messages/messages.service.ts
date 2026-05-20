import { randomUUID } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { WahaService } from '@app/integrations/waha/waha.service';
import { WahaStoreService } from '@app/integrations/waha-store/waha-store.service';
import { SocketEmitter } from '@app/realtime/socket.emitter';
import { TransactionRunner } from '@app/infra/db/transactions';
import { MessageRepository } from './message.repository';
import { PendingMessageStore } from './pending.store';
import { sortByRowid } from './jid';
import {
  type DeleteMessageInput,
  type EditMessageInput,
  type ForwardInput,
  type ListMessagesQuery,
  type ReactInput,
  type SendMediaInput,
  type SendTextInput,
} from './message.schema';
import { InvalidMediaPayloadError, MessageNotFoundError } from './messages.errors';
import { type EnrichedMessage, type MessageDomain, type MessageType } from './message.types';

function dtoFor(message: MessageDomain): {
  id: string;
  chatId: string;
  stanzaId: string;
  fromJid: string;
  fromMe: boolean;
  body: string | null;
  type: string;
  sentAt: string;
} {
  return {
    id: message.id,
    chatId: message.chatId,
    stanzaId: message.stanzaId,
    fromJid: message.fromJid,
    fromMe: message.fromMe,
    body: message.body,
    type: message.type,
    sentAt: message.sentAt.toISOString(),
  };
}

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private readonly repo: MessageRepository,
    private readonly waha: WahaService,
    private readonly store: WahaStoreService,
    private readonly pending: PendingMessageStore,
    private readonly emitter: SocketEmitter,
    private readonly tx: TransactionRunner,
  ) {}

  /**
   * Returns the most recent N messages for a chat, enriched with reactions
   * / quotes / mentions / edits / deletion. Cursor pagination by
   * `(sentAt, stanzaId)` so edits with identical `sentAt` deterministically
   * order by the stable WAHA stanza id; rowid is layered in afterwards.
   */
  async list(
    session: string,
    chatId: string,
    query: ListMessagesQuery,
  ): Promise<EnrichedMessage[]> {
    const rows = await this.repo.listByChat(chatId, {
      limit: query.limit,
      ...(query.beforeSentAt === undefined ? {} : { beforeSentAt: query.beforeSentAt }),
      ...(query.beforeStanzaId === undefined ? {} : { beforeStanzaId: query.beforeStanzaId }),
    });
    const stamped = await this.layerRowids(session, chatId, rows);
    const enriched = await this.repo.enrich(stamped);
    return sortByRowid(enriched).reverse();
  }

  async sendText(chatId: string, input: SendTextInput): Promise<{ id: string; stanzaId: string }> {
    const sentAt = new Date();
    return this.tx.run(async (em) => {
      const id = randomUUID();
      // Use a temporary stanza id; the webhook will reconcile with the real one.
      const stanzaId = `local:${id}`;
      const localFromJid = `local@${input.session}`;
      const shadow = await this.repo.upsert(
        {
          id,
          chatId,
          stanzaId,
          sessionId: null,
          fromJid: localFromJid,
          fromMe: true,
          body: input.text,
          type: 'TEXT',
          rowId: null,
          sentAt,
        },
        em,
      );
      if (input.quotedStanzaId !== undefined) {
        await this.repo.setQuote(
          { stanzaId, quotedStanzaId: input.quotedStanzaId, quotedBody: null },
          em,
        );
      }
      if (input.mentions !== undefined && input.mentions.length > 0) {
        await this.repo.setMentions(stanzaId, input.mentions, em);
      }

      const sent = await this.waha.sendText({
        session: input.session,
        chatId,
        text: input.text,
        ...(input.quotedStanzaId === undefined ? {} : { quotedMessageId: input.quotedStanzaId }),
        ...(input.mentions === undefined ? {} : { mentions: input.mentions }),
      });

      // Replace the temporary stanza id with WAHA's once the round-trip succeeds.
      await this.repo.upsert(
        {
          id: shadow.id,
          chatId,
          stanzaId: sent.id,
          sessionId: null,
          fromJid: sent.from ?? localFromJid,
          fromMe: true,
          body: input.text,
          type: 'TEXT',
          rowId: null,
          sentAt,
        },
        em,
      );
      await this.pending.add(sent.id);
      this.logger.debug(`sendText reconciled local stanza ${stanzaId} -> ${sent.id}`);
      return { id: shadow.id, stanzaId: sent.id };
    });
  }

  async sendMedia(
    chatId: string,
    input: SendMediaInput,
  ): Promise<{ id: string; stanzaId: string }> {
    if (input.data === undefined && input.url === undefined) {
      throw new InvalidMediaPayloadError();
    }
    const sent = await this.waha.sendMedia({
      session: input.session,
      chatId,
      file: {
        mimetype: input.mimetype,
        ...(input.data === undefined ? {} : { data: input.data }),
        ...(input.url === undefined ? {} : { url: input.url }),
        ...(input.filename === undefined ? {} : { filename: input.filename }),
      },
      ...(input.caption === undefined ? {} : { caption: input.caption }),
      ...(input.asDocument === undefined ? {} : { asDocument: input.asDocument }),
    });
    const id = randomUUID();
    const sentAt = new Date();
    await this.repo.upsert({
      id,
      chatId,
      stanzaId: sent.id,
      sessionId: null,
      fromJid: sent.from ?? `local@${input.session}`,
      fromMe: true,
      body: input.caption ?? null,
      type: classifyMediaType(input.mimetype, input.asDocument),
      rowId: null,
      sentAt,
    });
    await this.pending.add(sent.id);
    return { id, stanzaId: sent.id };
  }

  async edit(chatId: string, stanzaId: string, input: EditMessageInput): Promise<void> {
    const existing = await this.repo.findByStanzaId(stanzaId);
    if (existing === null) throw new MessageNotFoundError(stanzaId);
    await this.waha.editMessage({
      session: input.session,
      chatId,
      messageId: stanzaId,
      text: input.text,
    });
    await this.tx.run(async (em) => {
      await this.repo.recordEdit(stanzaId, existing.body, input.text, em);
      await this.repo.upsert({ ...existing, body: input.text }, em);
    });
    this.emitter.toChat(chatId, 'message:edited', {
      chatId,
      stanzaId,
      newBody: input.text,
      editedAt: new Date().toISOString(),
    });
  }

  async delete(chatId: string, stanzaId: string, input: DeleteMessageInput): Promise<void> {
    const existing = await this.repo.findByStanzaId(stanzaId);
    if (existing === null) throw new MessageNotFoundError(stanzaId);
    await this.waha.deleteMessage({ session: input.session, chatId, messageId: stanzaId });
    await this.repo.markDeleted(stanzaId);
    this.emitter.toChat(chatId, 'message:deleted', {
      chatId,
      stanzaId,
      deletedAt: new Date().toISOString(),
    });
  }

  async react(chatId: string, stanzaId: string, input: ReactInput): Promise<{ removed: boolean }> {
    const existing = await this.repo.findByStanzaId(stanzaId);
    if (existing === null) throw new MessageNotFoundError(stanzaId);
    await this.waha.reactToMessage({
      session: input.session,
      chatId,
      messageId: stanzaId,
      reaction: input.emoji,
    });
    const result = await this.repo.upsertReactionToggle({
      stanzaId,
      senderJid: `local@${input.session}`,
      emoji: input.emoji,
      createdAt: new Date(),
    });
    this.emitter.toChat(chatId, 'message:reaction', {
      chatId,
      stanzaId,
      senderJid: `local@${input.session}`,
      emoji: input.emoji,
      removed: result.removed,
    });
    return result;
  }

  async forward(
    chatId: string,
    stanzaId: string,
    input: ForwardInput,
  ): Promise<{ stanzaId: string }> {
    const sent = await this.waha.forwardMessage({
      session: input.session,
      fromChatId: chatId,
      toChatId: input.toChatId,
      messageId: stanzaId,
    });
    return { stanzaId: sent.id };
  }

  /**
   * Reconciliation entrypoint for the webhook handler. Returns whether the
   * inbound message had a matching local shadow — if so, we still persist /
   * update, but the caller should suppress the duplicate `message:new`
   * socket emission to avoid double-rendering the bubble.
   */
  async upsertFromWebhook(input: {
    chatId: string;
    stanzaId: string;
    fromJid: string;
    fromMe: boolean;
    body: string | null;
    type: MessageType;
    sentAt: Date;
  }): Promise<{ message: MessageDomain; wasPending: boolean }> {
    const wasPending = await this.pending.isPending(input.stanzaId);
    const message = await this.repo.upsert({
      chatId: input.chatId,
      stanzaId: input.stanzaId,
      sessionId: null,
      fromJid: input.fromJid,
      fromMe: input.fromMe,
      body: input.body,
      type: input.type,
      rowId: null,
      sentAt: input.sentAt,
    });
    if (wasPending) {
      await this.pending.resolve(input.stanzaId);
    } else {
      this.emitter.toChat(input.chatId, 'message:new', {
        chatId: input.chatId,
        message: dtoFor(message),
      });
    }
    return { message, wasPending };
  }

  private async layerRowids(
    session: string,
    chatId: string,
    rows: MessageDomain[],
  ): Promise<MessageDomain[]> {
    if (rows.length === 0) return rows;
    try {
      const rowids = await this.store.getMessageRowids(session, chatId);
      const map = new Map(rowids.map((r) => [r.stanzaId, r.rowid]));
      return rows.map((r) => ({ ...r, rowId: map.get(r.stanzaId) ?? r.rowId }));
    } catch (err) {
      this.logger.warn(`rowid layering skipped for chat=${chatId}: ${(err as Error).message}`);
      return rows;
    }
  }
}

function classifyMediaType(mimetype: string, asDocument: boolean | undefined): MessageType {
  if (asDocument === true) return 'DOCUMENT';
  if (mimetype.startsWith('image/')) return 'IMAGE';
  if (mimetype.startsWith('video/')) return 'VIDEO';
  if (mimetype.startsWith('audio/')) return 'AUDIO';
  return 'DOCUMENT';
}
