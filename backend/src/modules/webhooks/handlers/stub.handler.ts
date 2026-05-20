import { Injectable, Logger } from '@nestjs/common';
import { type WebhookHandler } from '../handler.types';
import { type NormalizedWebhookEvent } from '../webhook.schema';

/**
 * Phase-7 stub. Logs the event and returns success so the queue marks the
 * job complete. Each phase-8 domain module swaps in a real implementation
 * by re-binding the matching `Symbol` token in `WebhooksModule.providers`.
 */
@Injectable()
export class WebhookStubHandler implements WebhookHandler {
  constructor(private readonly label: string) {}

  private readonly logger = new Logger(`WebhookStub`);

  handle(event: NormalizedWebhookEvent): Promise<void> {
    this.logger.debug(
      `stub[${this.label}] event=${event.event} session=${event.session} id=${event.id}`,
    );
    return Promise.resolve();
  }
}
