import { Inject, Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus';
import { REDIS_CLIENT } from '@app/infra/cache/constants';
import { type RedisClient } from '@app/infra/cache/redis.provider';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: RedisClient) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      const pong = await this.redis.ping();
      return this.getStatus(key, true, { status: pong });
    } catch (err) {
      throw new HealthCheckError('Redis ping failed', {
        [key]: { status: 'down', message: (err as Error).message },
      });
    }
  }
}
