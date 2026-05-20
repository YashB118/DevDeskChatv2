import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { SocketEmitter } from '@app/realtime/socket.emitter';
import { type WebhookHandler } from '../handler.types';
import { type NormalizedWebhookEvent } from '../webhook.schema';

const Schema = z.object({
  id: z.string().min(1),
  chatId: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
  ack: z.enum(['SENT', 'DELIVERED', 'READ', 'PLAYED', 'FAILED']),
});

@Injectable()
export class MessageAckWebhookHandler implements WebhookHandler {
  private readonly logger = new Logger(MessageAckWebhookHandler.name);

  constructor(private readonly emitter: SocketEmitter) {}

  async handle(event: NormalizedWebhookEvent): Promise<void> {
    const parsed = Schema.safeParse(event.payload);
    if (!parsed.success) {
      this.logger.warn(`malformed message.ack payload id=${event.id}`);
      return;
    }
    const chatId = parsed.data.chatId ?? parsed.data.from;
    if (chatId === undefined) return;
    this.emitter.toChat(chatId, 'message:ack', {
      chatId,
      stanzaId: parsed.data.id,
      ack: parsed.data.ack,
    });
    return Promise.resolve();
  }
}
