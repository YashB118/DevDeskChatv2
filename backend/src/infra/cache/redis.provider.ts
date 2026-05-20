import { type FactoryProvider, Logger } from '@nestjs/common';
import Redis, { type RedisOptions } from 'ioredis';
import { APP_CONFIG } from '@app/config/constants';
import { type AppConfig } from '@app/config/env';
import { REDIS_CLIENT } from './constants';

export type RedisClient = Redis;

export const redisProvider: FactoryProvider<RedisClient> = {
  provide: REDIS_CLIENT,
  inject: [APP_CONFIG],
  useFactory: (env: AppConfig): RedisClient => {
    const logger = new Logger('Redis');
    const options: RedisOptions = {
      keyPrefix: env.REDIS_KEY_PREFIX,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(1000 * 2 ** Math.min(times, 6), 30_000),
    };
    const client = new Redis(env.REDIS_URL, options);

    client.on('error', (err: Error) => {
      logger.error(`Redis error: ${err.message}`);
    });
    client.on('reconnecting', (delayMs: number) => {
      logger.warn(`Redis reconnecting in ${delayMs.toString()}ms`);
    });
    client.on('ready', () => {
      logger.log('Redis ready');
    });

    return client;
  },
};
