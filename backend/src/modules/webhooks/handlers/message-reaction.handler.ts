import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { MessageRepository } from '@app/modules/messages/message.repository';
import { SocketEmitter } from '@app/realtime/socket.emitter';
import { type WebhookHandler } from '../handler.types';
import { type NormalizedWebhookEvent } from '../webhook.schema';

const Schema = z.object({
  id: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  chatId: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
  sender: z.string().min(1).optional(),
  reaction: z.string().min(1).nullable().optional(),
  emoji: z.string().min(1).nullable().optional(),
});

@Injectable()
export class MessageReactionWebhookHandler implements WebhookHandler {
  private readonly logger = new Logger(MessageReactionWebhookHandler.name);

  constructor(
    private readonly messages: MessageRepository,
    private readonly emitter: SocketEmitter,
  ) {}

  async handle(event: NormalizedWebhookEvent): Promise<void> {
    const parsed = Schema.safeParse(event.payload);
    if (!parsed.success) {
      this.logger.warn(`malformed message.reaction payload id=${event.id}`);
      return;
    }
    const p = parsed.data;
    const stanzaId = p.id ?? p.messageId;
    const chatId = p.chatId ?? p.from;
    const senderJid = p.sender ?? p.from;
    const emoji = p.emoji ?? p.reaction ?? null;
    if (
      stanzaId === undefined ||
      chatId === undefined ||
      senderJid === undefined ||
      emoji === null
    ) {
      return;
    }
    const result = await this.messages.upsertReactionToggle({
      stanzaId,
      senderJid,
      emoji,
      createdAt: new Date(),
    });
    this.emitter.toChat(chatId, 'message:reaction', {
      chatId,
      stanzaId,
      senderJid,
      emoji,
      removed: result.removed,
    });
  }
}
