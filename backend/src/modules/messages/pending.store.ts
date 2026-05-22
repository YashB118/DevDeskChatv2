import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { type RedisClient } from '@app/infra/cache/redis.provider';
import { REDIS_CLIENT } from '@app/infra/cache/constants';
import { PENDING_MESSAGE_KEY_PREFIX } from './constants';

/**
 * Tracks message IDs we just submitted to WAHA but haven't yet seen come
 * back as a webhook. The reconciliation window is short (TTL ≈ 9s) — long
 * enough to outlive the round-trip, short enough that a missed webhook
 * doesn't poison future sends.
 *
 * Phase 8 wires this into both the send path (`add` after WAHA accepts)
 * and the webhook handler (`isPending` decides whether to re-emit on the
 * socket; `resolve` ack's the round-trip).
 */
@Injectable()
export class PendingMessageStore {
  private readonly logger = new Logger(PendingMessageStore.name);
  private readonly ttlMs: number;

  constructor(
    @Inject(APP_CONFIG) env: AppConfig,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
  ) {
    this.ttlMs = env.PENDING_MESSAGE_TTL_MS;
  }

  async add(stanzaId: string, ttlMs: number = this.ttlMs): Promise<void> {
    // ioredis throws on ttlMs <= 0. Clamp to a sane minimum so a misconfigured
    // env or a caller pass-through can't crash the send path.
    const safeTtl = ttlMs > 0 ? ttlMs : 1;
    await this.redis.set(this.key(stanzaId), '1', 'PX', safeTtl);
  }

  async isPending(stanzaId: string): Promise<boolean> {
    const exists = await this.redis.exists(this.key(stanzaId));
    return exists === 1;
  }

  async resolve(stanzaId: string): Promise<boolean> {
    const removed = await this.redis.del(this.key(stanzaId));
    if (removed > 0) {
      this.logger.debug(`pending message resolved stanzaId=${stanzaId}`);
    }
    return removed > 0;
  }

  private key(stanzaId: string): string {
    return `${PENDING_MESSAGE_KEY_PREFIX}${stanzaId}`;
  }
}
