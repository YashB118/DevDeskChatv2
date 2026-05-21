import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '@app/infra/cache/constants';
import { type RedisClient } from '@app/infra/cache/redis.provider';

// Sliding-window counter.
// 1. Drop entries older than (now - windowMs).
// 2. Read remaining cardinality (calls already inside the window).
// 3. If cardinality >= max → return (limited, retryAfter derived from oldest entry).
// 4. Otherwise insert <now, unique-token> and bump key TTL.
//
// The unique-token guarantees ZADD never overwrites a same-millisecond entry,
// so concurrent callers don't share a slot when burst arrives within 1ms.
const SLIDING_WINDOW_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local token = ARGV[4]
local cutoff = now - windowMs
redis.call('zremrangebyscore', key, '-inf', cutoff)
local count = redis.call('zcard', key)
if count >= max then
  local oldest = redis.call('zrange', key, 0, 0, 'WITHSCORES')
  local oldestScore = tonumber(oldest[2]) or now
  local resetAt = oldestScore + windowMs
  return { 1, count, resetAt }
end
redis.call('zadd', key, now, token)
redis.call('pexpire', key, windowMs)
return { 0, count + 1, now + windowMs }
`;

export interface RateLimitResult {
  limited: boolean;
  count: number;
  retryAfterSeconds: number;
  resetAt: number;
}

export interface RateLimitOptions {
  key: string;
  windowSeconds: number;
  max: number;
}

let scriptSha: string | null = null;

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  async consume(opts: RateLimitOptions): Promise<RateLimitResult> {
    const now = Date.now();
    const windowMs = opts.windowSeconds * 1000;
    const token = `${now.toString()}-${Math.random().toString(36).slice(2, 10)}`;

    const raw = await this.evalScript(opts.key, now, windowMs, opts.max, token);
    const [limitedFlag, count, resetAt] = raw;
    const limited = limitedFlag === 1;
    const retryAfterMs = Math.max(0, resetAt - now);
    return {
      limited,
      count,
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  // Test-only escape hatch.
  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }

  private async evalScript(
    key: string,
    now: number,
    windowMs: number,
    max: number,
    token: string,
  ): Promise<[number, number, number]> {
    const args = [now.toString(), windowMs.toString(), max.toString(), token];
    try {
      scriptSha ??= (await this.redis.script('LOAD', SLIDING_WINDOW_SCRIPT)) as string;
      return (await this.redis.evalsha(scriptSha, 1, key, ...args)) as [number, number, number];
    } catch (err) {
      const message = (err as Error).message;
      if (message.includes('NOSCRIPT')) {
        scriptSha = null;
        return (await this.redis.eval(SLIDING_WINDOW_SCRIPT, 1, key, ...args)) as [
          number,
          number,
          number,
        ];
      }
      this.logger.warn(`Sliding-window EVAL failed (${message}); failing open`);
      // Failing open is the safer default: a Redis blip shouldn't black-hole
      // the API. Observability surfaces the underlying outage already.
      return [0, 0, now + windowMs];
    }
  }
}
