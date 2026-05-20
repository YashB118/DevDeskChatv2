import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { type Queue } from 'bullmq';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { type JobEnvelope } from '@app/queues/job.types';
import { WEBHOOK_JOB_PROCESS, WEBHOOK_QUEUE } from './constants';
import { type WebhookEnvelope } from './webhook.schema';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly hmacSecret: string | undefined;
  private readonly hmacHeader: string;

  constructor(
    @Inject(APP_CONFIG) env: AppConfig,
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue<JobEnvelope<WebhookEnvelope>>,
  ) {
    this.hmacSecret = env.WAHA_WEBHOOK_HMAC_SECRET;
    this.hmacHeader = env.WAHA_WEBHOOK_HMAC_HEADER.toLowerCase();
  }

  hmacHeaderName(): string {
    return this.hmacHeader;
  }

  /**
   * Verifies the HMAC signature over raw bytes. Returns `true` when no
   * secret is configured (HMAC disabled) so dev/test setups don't have
   * to plumb a shared secret to run.
   */
  verifySignature(rawBody: Buffer | undefined, providedSignature: string | undefined): boolean {
    if (this.hmacSecret === undefined) return true;
    if (rawBody === undefined || providedSignature === undefined) return false;
    const expected = createHmac('sha256', this.hmacSecret).update(rawBody).digest('hex');
    const provided = providedSignature.replace(/^sha256=/i, '');
    if (provided.length !== expected.length) return false;
    try {
      return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(provided, 'hex'));
    } catch {
      return false;
    }
  }

  async enqueue(envelope: WebhookEnvelope, correlationId: string | undefined): Promise<void> {
    const data: JobEnvelope<WebhookEnvelope> = {
      payload: envelope,
      ...(correlationId === undefined ? {} : { correlationId }),
    };
    // jobId = WAHA event id → BullMQ dedupes redeliveries at the queue layer.
    await this.queue.add(WEBHOOK_JOB_PROCESS, data, { jobId: envelope.id });
    this.logger.debug(`webhook enqueued event=${envelope.event} id=${envelope.id}`);
  }
}
