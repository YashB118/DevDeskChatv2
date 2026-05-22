import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { SessionsService } from '@app/modules/sessions/sessions.service';
import { type WebhookHandler } from '../handler.types';
import { type NormalizedWebhookEvent } from '../webhook.schema';

const Schema = z.object({
  status: z.enum(['STARTING', 'SCAN_QR_CODE', 'WORKING', 'STOPPED', 'FAILED']),
});

@Injectable()
export class SessionStatusWebhookHandler implements WebhookHandler {
  private readonly logger = new Logger(SessionStatusWebhookHandler.name);

  constructor(private readonly sessions: SessionsService) {}

  async handle(event: NormalizedWebhookEvent): Promise<void> {
    const parsed = Schema.safeParse(event.payload);
    if (!parsed.success) {
      this.logger.warn(`malformed session.status payload id=${event.id}`);
      return;
    }
    // Trust the envelope `session`, never the payload — payload `name` would
    // let an attacker mutate a different session's status.
    await this.sessions.applyStatusUpdate(event.session, parsed.data.status);
  }
}
