import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '@app/infra/cache/constants';
import { type RedisClient } from '@app/infra/cache/redis.provider';

/**
 * Monotonic per-stream sequence counter backed by Redis INCR.
 * Used by future phases for missed-event resume — clients reconnect with the
 * last seq they saw; the server replays anything newer.
 *
 * Stream key shape: `rt:seq:<stream>` — `stream` is opaque (e.g. `chat:<id>`).
 * The Redis client already applies the global keyPrefix from env.
 */
@Injectable()
export class SequenceService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  private key(stream: string): string {
    return `rt:seq:${stream}`;
  }

  async next(stream: string): Promise<number> {
    return this.redis.incr(this.key(stream));
  }

  async current(stream: string): Promise<number> {
    const v = await this.redis.get(this.key(stream));
    return v ? Number.parseInt(v, 10) : 0;
  }

  async reset(stream: string): Promise<void> {
    await this.redis.del(this.key(stream));
  }
}
