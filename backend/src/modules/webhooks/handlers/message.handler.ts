import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { MessagesService } from '@app/modules/messages/messages.service';
import { type MessageType } from '@app/modules/messages/message.types';
import { type WebhookHandler } from '../handler.types';
import { type NormalizedWebhookEvent } from '../webhook.schema';

const InboundMessageSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1).optional(),
  to: z.string().min(1).optional(),
  fromMe: z.boolean().optional(),
  body: z.string().nullable().optional(),
  type: z.string().optional(),
  timestamp: z.number().optional(),
  chatId: z.string().min(1).optional(),
});

function inferType(raw: string | undefined): MessageType {
  switch ((raw ?? '').toLowerCase()) {
    case 'text':
    case 'chat':
      return 'TEXT';
    case 'image':
      return 'IMAGE';
    case 'video':
      return 'VIDEO';
    case 'audio':
    case 'voice':
    case 'ptt':
      return 'AUDIO';
    case 'document':
      return 'DOCUMENT';
    case 'sticker':
      return 'STICKER';
    case 'location':
      return 'LOCATION';
    case 'contact':
    case 'vcard':
      return 'CONTACT';
    case 'system':
      return 'SYSTEM';
    default:
      return 'UNKNOWN';
  }
}

@Injectable()
export class MessageWebhookHandler implements WebhookHandler {
  private readonly logger = new Logger(MessageWebhookHandler.name);

  constructor(private readonly messages: MessagesService) {}

  async handle(event: NormalizedWebhookEvent): Promise<void> {
    const parsed = InboundMessageSchema.safeParse(event.payload);
    if (!parsed.success) {
      this.logger.warn(`malformed message payload id=${event.id}`);
      return;
    }
    const m = parsed.data;
    const chatId = m.chatId ?? m.from ?? '';
    if (chatId === '') {
      this.logger.warn(`no chatId for message id=${m.id}`);
      return;
    }
    const sentAt =
      m.timestamp !== undefined && m.timestamp > 0 ? new Date(m.timestamp * 1000) : new Date();
    await this.messages.upsertFromWebhook({
      chatId,
      stanzaId: m.id,
      fromJid: m.from ?? 'unknown',
      fromMe: m.fromMe ?? false,
      body: m.body ?? null,
      type: inferType(m.type),
      sentAt,
    });
  }
}
