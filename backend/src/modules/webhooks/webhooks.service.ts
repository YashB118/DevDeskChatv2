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
  private readonly maxAgeMs: number;
  private readonly isProd: boolean;

  constructor(
    @Inject(APP_CONFIG) env: AppConfig,
    @InjectQueue(WEBHOOK_QUEUE) private readonly queue: Queue<JobEnvelope<WebhookEnvelope>>,
  ) {
    this.hmacSecret = env.WAHA_WEBHOOK_HMAC_SECRET;
    this.hmacHeader = env.WAHA_WEBHOOK_HMAC_HEADER.toLowerCase();
    this.maxAgeMs = env.WAHA_WEBHOOK_MAX_AGE_MS;
    this.isProd = env.NODE_ENV === 'production';
    if (this.isProd && this.hmacSecret === undefined) {
      // Fail-closed in prod: no secret = nobody can hit the webhook.
      this.logger.error(
        'WAHA_WEBHOOK_HMAC_SECRET is required in production — webhook ingress is locked down',
      );
    }
  }

  hmacHeaderName(): string {
    return this.hmacHeader;
  }

  /**
   * Verifies the HMAC signature over raw bytes. In production an unset secret
   * fails closed; in dev/test it returns `true` so local setups don't have to
   * plumb a shared secret.
   */
  verifySignature(rawBody: Buffer | undefined, providedSignature: string | undefined): boolean {
    if (this.hmacSecret === undefined) return !this.isProd;
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

  /**
   * Reject envelopes whose `timestamp` is older than `WAHA_WEBHOOK_MAX_AGE_MS`.
   * Pairs with the HMAC check: HMAC alone protects against forgery but lets a
   * captured signed body be replayed later.
   */
  isFresh(envelope: WebhookEnvelope, now: number = Date.now()): boolean {
    if (this.maxAgeMs === 0) return true;
    if (envelope.timestamp === undefined) return true;
    return Math.abs(now - envelope.timestamp) <= this.maxAgeMs;
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
