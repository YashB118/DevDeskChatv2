import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job } from 'bullmq';
import { WahaStoreService } from '@app/integrations/waha-store/waha-store.service';
import { WebhookDispatch } from '@app/modules/webhooks/dispatch';
import {
  WebhookEnvelopeSchema,
  type NormalizedWebhookEvent,
  type WebhookEnvelope,
} from '@app/modules/webhooks/webhook.schema';
import { WEBHOOK_QUEUE } from '@app/modules/webhooks/constants';
import { type JobEnvelope } from './job.types';
import { WorkerHarness } from './worker.harness';

/**
 * Pops a webhook envelope, normalizes phone-format JIDs to LID via the
 * NOWEB SQLite store, and dispatches to the right handler. Failures
 * bubble so BullMQ retries; idempotency is upstream (jobId = event.id).
 */
@Processor(WEBHOOK_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    private readonly harness: WorkerHarness,
    private readonly store: WahaStoreService,
    private readonly dispatch: WebhookDispatch,
  ) {
    super();
  }

  async process(job: Job<JobEnvelope<unknown>>): Promise<{ event: string; dispatched: boolean }> {
    return this.harness.run(job, WebhookEnvelopeSchema, async (envelope: WebhookEnvelope) => {
      const normalized = await this.normalize(envelope);
      await this.dispatch.dispatch(normalized);
      return { event: normalized.event, dispatched: true };
    });
  }

  /**
   * Walks the payload, replacing every recognized phone-format JID
   * (e.g. `1555...@s.whatsapp.net`) with its LID counterpart from the
   * NOWEB store. Falls through unchanged for already-LID JIDs and
   * anything the store can't resolve.
   */
  private async normalize(envelope: WebhookEnvelope): Promise<NormalizedWebhookEvent> {
    const payload = await this.normalizeValue(envelope.session, envelope.payload);
    return {
      id: envelope.id,
      event: envelope.event,
      session: envelope.session,
      timestamp: envelope.timestamp,
      payload,
    };
  }

  private async normalizeValue(session: string, value: unknown): Promise<unknown> {
    if (typeof value === 'string') {
      return this.normalizeJid(session, value);
    }
    if (Array.isArray(value)) {
      return Promise.all(value.map((v) => this.normalizeValue(session, v)));
    }
    if (value !== null && typeof value === 'object') {
      const entries = await Promise.all(
        Object.entries(value).map(
          async ([k, v]) => [k, await this.normalizeValue(session, v)] as const,
        ),
      );
      return Object.fromEntries(entries);
    }
    return value;
  }

  private async normalizeJid(session: string, value: string): Promise<string> {
    if (!isPhoneJid(value)) return value;
    try {
      const lid = await this.store.phoneToLid(session, value);
      return lid ?? value;
    } catch (err) {
      this.logger.warn(`phone→LID lookup failed for ${value}: ${(err as Error).message}`);
      return value;
    }
  }
}

function isPhoneJid(value: string): boolean {
  return /^\d+@s\.whatsapp\.net$/.test(value);
}
