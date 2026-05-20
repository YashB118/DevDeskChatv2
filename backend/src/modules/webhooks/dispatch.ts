import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  MESSAGE_ACK_HANDLER,
  MESSAGE_EDITED_HANDLER,
  MESSAGE_HANDLER,
  MESSAGE_REACTION_HANDLER,
  MESSAGE_REVOKED_HANDLER,
  GROUP_PARTICIPANTS_HANDLER,
  SESSION_STATUS_HANDLER,
  type WebhookHandler,
} from './handler.types';
import { type NormalizedWebhookEvent } from './webhook.schema';

/**
 * Event-type → handler registry. Phase 7 wires this with stubs; Phase 8
 * replaces each stub with the real domain service handler. Unknown
 * event types are ack'd (logged + returned) so the queue doesn't retry
 * forever — WAHA may add events we don't care about.
 */
@Injectable()
export class WebhookDispatch {
  private readonly logger = new Logger(WebhookDispatch.name);
  private readonly handlers: Map<string, WebhookHandler>;

  constructor(
    @Inject(MESSAGE_HANDLER) messageHandler: WebhookHandler,
    @Inject(MESSAGE_ACK_HANDLER) ackHandler: WebhookHandler,
    @Inject(MESSAGE_EDITED_HANDLER) editedHandler: WebhookHandler,
    @Inject(MESSAGE_REACTION_HANDLER) reactionHandler: WebhookHandler,
    @Inject(MESSAGE_REVOKED_HANDLER) revokedHandler: WebhookHandler,
    @Inject(SESSION_STATUS_HANDLER) sessionStatusHandler: WebhookHandler,
    @Inject(GROUP_PARTICIPANTS_HANDLER) groupParticipantsHandler: WebhookHandler,
  ) {
    this.handlers = new Map<string, WebhookHandler>([
      ['message', messageHandler],
      ['message.any', messageHandler],
      ['message.ack', ackHandler],
      ['message.edited', editedHandler],
      ['message.reaction', reactionHandler],
      ['message.revoked', revokedHandler],
      ['session.status', sessionStatusHandler],
      ['group.v2.participants', groupParticipantsHandler],
    ]);
  }

  async dispatch(event: NormalizedWebhookEvent): Promise<void> {
    const handler = this.handlers.get(event.event);
    if (handler === undefined) {
      this.logger.warn(`unhandled webhook event=${event.event} id=${event.id}`);
      return;
    }
    await handler.handle(event);
  }
}
