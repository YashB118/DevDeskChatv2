import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ZodSchema } from 'zod';
import { REDIS_CLIENT } from './constants';
import { type RedisClient } from './redis.provider';
import { DistributedLockService } from './distributed-lock.service';

export interface WrapOptions<T> {
  ttlSeconds: number;
  schema: ZodSchema<T>;
  lockTtlMs?: number;
  lockRetries?: number;
  lockRetryDelayMs?: number;
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    private readonly locks: DistributedLockService,
  ) {}

  async get<T>(key: string, schema: ZodSchema<T>): Promise<T | null> {
    const raw = await this.redis.get(key);
    if (raw === null) return null;
    return this.safeParse(key, raw, schema);
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async wrap<T>(key: string, loader: () => Promise<T>, opts: WrapOptions<T>): Promise<T> {
    const cached = await this.get(key, opts.schema);
    if (cached !== null) return cached;

    const lockKey = `lock:${key}`;
    const lockTtlMs = opts.lockTtlMs ?? 5_000;
    const handle = await this.locks.acquire(lockKey, {
      ttlMs: lockTtlMs,
      retries: opts.lockRetries ?? 20,
      retryDelayMs: opts.lockRetryDelayMs ?? 50,
    });

    if (handle === null) {
      this.logger.warn(`Lock contention on ${key}; running loader without exclusivity`);
      return loader();
    }

    try {
      const recheck = await this.get(key, opts.schema);
      if (recheck !== null) return recheck;

      const value = await loader();
      await this.set(key, value, opts.ttlSeconds);
      return value;
    } finally {
      await handle.release();
    }
  }

  private safeParse<T>(key: string, raw: string, schema: ZodSchema<T>): T | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn(`Cache value at ${key} not JSON; evicting`);
      void this.redis.del(key);
      return null;
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      this.logger.warn(`Cache value at ${key} failed schema validation; evicting`);
      void this.redis.del(key);
      return null;
    }
    return result.data;
  }
}
