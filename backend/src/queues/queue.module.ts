import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { type QueueOptions } from 'bullmq';
import { APP_CONFIG } from '@app/config/constants';
import { ConfigModule } from '@app/config/config.module';
import { type AppConfig } from '@app/config/env';
import { WEBHOOK_QUEUE } from '@app/modules/webhooks/constants';
import { EXAMPLE_QUEUE } from './constants';
import { ExampleProcessor } from './example.processor';
import { ExampleQueueProducer } from './example.queue';
import { WorkerHarness } from './worker.harness';

function buildQueueOptions(env: AppConfig): QueueOptions {
  const url = new URL(env.REDIS_URL);
  const port = url.port === '' ? 6379 : Number(url.port);
  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  return {
    // BullMQ owns its Redis connection (separate from `REDIS_CLIENT`)
    // because workers require `maxRetriesPerRequest: null` for blocking
    // BRPOPLPUSH; sharing the app client would break unrelated callers.
    connection: {
      host: url.hostname,
      port,
      db,
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      ...(url.username === '' ? {} : { username: decodeURIComponent(url.username) }),
      ...(url.password === '' ? {} : { password: decodeURIComponent(url.password) }),
    },
    prefix: env.QUEUE_PREFIX,
    defaultJobOptions: {
      attempts: env.QUEUE_DEFAULT_ATTEMPTS,
      backoff: { type: 'exponential', delay: env.QUEUE_DEFAULT_BACKOFF_MS },
      removeOnComplete: { count: env.QUEUE_REMOVE_ON_COMPLETE },
      removeOnFail: { count: env.QUEUE_REMOVE_ON_FAIL },
    },
  };
}

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [APP_CONFIG],
      useFactory: buildQueueOptions,
    }),
    BullModule.registerQueue({ name: EXAMPLE_QUEUE }, { name: WEBHOOK_QUEUE }),
  ],
  providers: [WorkerHarness, ExampleQueueProducer, ExampleProcessor],
  exports: [BullModule, WorkerHarness, ExampleQueueProducer],
})
export class QueueModule {}

export { buildQueueOptions };
