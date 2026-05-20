import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { MessageRepository } from '@app/modules/messages/message.repository';
import { SocketEmitter } from '@app/realtime/socket.emitter';
import { type WebhookHandler } from '../handler.types';
import { type NormalizedWebhookEvent } from '../webhook.schema';

const Schema = z.object({
  id: z.string().min(1),
  chatId: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
});

@Injectable()
export class MessageRevokedWebhookHandler implements WebhookHandler {
  private readonly logger = new Logger(MessageRevokedWebhookHandler.name);

  constructor(
    private readonly messages: MessageRepository,
    private readonly emitter: SocketEmitter,
  ) {}

  async handle(event: NormalizedWebhookEvent): Promise<void> {
    const parsed = Schema.safeParse(event.payload);
    if (!parsed.success) {
      this.logger.warn(`malformed message.revoked payload id=${event.id}`);
      return;
    }
    const chatId = parsed.data.chatId ?? parsed.data.from;
    if (chatId === undefined) return;
    await this.messages.markDeleted(parsed.data.id);
    this.emitter.toChat(chatId, 'message:deleted', {
      chatId,
      stanzaId: parsed.data.id,
      deletedAt: new Date().toISOString(),
    });
  }
}
