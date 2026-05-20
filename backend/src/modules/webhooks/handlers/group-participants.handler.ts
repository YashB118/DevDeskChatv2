import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { SocketEmitter } from '@app/realtime/socket.emitter';
import { type WebhookHandler } from '../handler.types';
import { type NormalizedWebhookEvent } from '../webhook.schema';

const Schema = z.object({
  chatId: z.string().min(1).optional(),
  groupId: z.string().min(1).optional(),
  from: z.string().min(1).optional(),
  action: z.enum(['add', 'remove', 'promote', 'demote']),
  participants: z.array(z.string().min(1)),
});

@Injectable()
export class GroupParticipantsWebhookHandler implements WebhookHandler {
  private readonly logger = new Logger(GroupParticipantsWebhookHandler.name);

  constructor(private readonly emitter: SocketEmitter) {}

  async handle(event: NormalizedWebhookEvent): Promise<void> {
    const parsed = Schema.safeParse(event.payload);
    if (!parsed.success) {
      this.logger.warn(`malformed group.v2.participants payload id=${event.id}`);
      return;
    }
    const chatId = parsed.data.chatId ?? parsed.data.groupId ?? parsed.data.from;
    if (chatId === undefined) return;
    this.emitter.toChat(chatId, 'group:participants', {
      chatId,
      action: parsed.data.action,
      participants: parsed.data.participants,
    });
    return Promise.resolve();
  }
}
