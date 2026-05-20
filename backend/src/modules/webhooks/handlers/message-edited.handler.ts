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
  body: z.string().nullable().optional(),
  editedAt: z.number().optional(),
});

@Injectable()
export class MessageEditedWebhookHandler implements WebhookHandler {
  private readonly logger = new Logger(MessageEditedWebhookHandler.name);

  constructor(
    private readonly messages: MessageRepository,
    private readonly emitter: SocketEmitter,
  ) {}

  async handle(event: NormalizedWebhookEvent): Promise<void> {
    const parsed = Schema.safeParse(event.payload);
    if (!parsed.success) {
      this.logger.warn(`malformed message.edited payload id=${event.id}`);
      return;
    }
    const m = parsed.data;
    const chatId = m.chatId ?? m.from;
    if (chatId === undefined) return;
    const existing = await this.messages.findByStanzaId(m.id);
    const editedAt =
      m.editedAt !== undefined && m.editedAt > 0 ? new Date(m.editedAt * 1000) : new Date();
    await this.messages.recordEdit(m.id, existing?.body ?? null, m.body ?? null);
    if (existing !== null) {
      await this.messages.upsert({ ...existing, body: m.body ?? null });
    }
    this.emitter.toChat(chatId, 'message:edited', {
      chatId,
      stanzaId: m.id,
      newBody: m.body ?? null,
      editedAt: editedAt.toISOString(),
    });
  }
}
