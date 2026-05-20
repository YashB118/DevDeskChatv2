import { Global, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { redisProvider, type RedisClient } from './redis.provider';
import { REDIS_CLIENT } from './constants';
import { CacheService } from './cache.service';
import { DistributedLockService } from './distributed-lock.service';

@Global()
@Module({
  providers: [redisProvider, CacheService, DistributedLockService],
  exports: [REDIS_CLIENT, CacheService, DistributedLockService],
})
export class CacheModule implements OnApplicationShutdown {
  private readonly logger = new Logger(CacheModule.name);

  constructor(private readonly moduleRef: ModuleRef) {}

  async onApplicationShutdown(): Promise<void> {
    const client = this.moduleRef.get<RedisClient>(REDIS_CLIENT, { strict: false });
    if (client.status === 'end') return;
    try {
      await client.quit();
    } catch (err) {
      this.logger.warn(`Redis quit failed: ${(err as Error).message}; forcing disconnect`);
      client.disconnect();
    }
  }
}
