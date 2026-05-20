import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type RedisClient } from './redis.provider';
import { REDIS_CLIENT } from './constants';

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

const EXTEND_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("pexpire", KEYS[1], ARGV[2])
else
  return 0
end
`;

export interface AcquireOptions {
  ttlMs: number;
  retries?: number;
  retryDelayMs?: number;
}

export interface LockHandle {
  readonly key: string;
  readonly token: string;
  release(): Promise<boolean>;
  extend(ttlMs: number): Promise<boolean>;
}

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {}

  async acquire(key: string, opts: AcquireOptions): Promise<LockHandle | null> {
    const retries = opts.retries ?? 0;
    const retryDelayMs = opts.retryDelayMs ?? 50;
    const token = randomBytes(16).toString('hex');

    for (let attempt = 0; attempt <= retries; attempt++) {
      const result = await this.redis.set(key, token, 'PX', opts.ttlMs, 'NX');
      if (result === 'OK') {
        return this.buildHandle(key, token);
      }
      if (attempt < retries) {
        await sleep(retryDelayMs);
      }
    }
    return null;
  }

  async with<T>(
    key: string,
    opts: AcquireOptions,
    fn: (handle: LockHandle) => Promise<T>,
  ): Promise<T> {
    const handle = await this.acquire(key, opts);
    if (handle === null) {
      throw new Error(`Could not acquire lock for ${key}`);
    }
    try {
      return await fn(handle);
    } finally {
      const released = await handle.release();
      if (!released) {
        this.logger.warn(`Lock ${key} already expired before release`);
      }
    }
  }

  private buildHandle(key: string, token: string): LockHandle {
    const redis = this.redis;
    return {
      key,
      token,
      release: async (): Promise<boolean> => {
        const res = (await redis.eval(RELEASE_SCRIPT, 1, key, token)) as number;
        return res === 1;
      },
      extend: async (ttlMs: number): Promise<boolean> => {
        const res = (await redis.eval(EXTEND_SCRIPT, 1, key, token, ttlMs.toString())) as number;
        return res === 1;
      },
    };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
