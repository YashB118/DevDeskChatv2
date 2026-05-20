import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { type Queue } from 'bullmq';
import { z } from 'zod';
import { EXAMPLE_QUEUE } from './constants';
import { type JobEnvelope } from './job.types';

export const ExamplePayloadSchema = z.object({
  message: z.string().min(1),
});
export type ExamplePayload = z.infer<typeof ExamplePayloadSchema>;

export const EXAMPLE_JOB_ECHO = 'example.echo';

export interface EnqueueExampleOptions {
  jobId: string;
  payload: ExamplePayload;
  correlationId?: string;
}

@Injectable()
export class ExampleQueueProducer {
  constructor(
    @InjectQueue(EXAMPLE_QUEUE)
    private readonly queue: Queue<JobEnvelope<ExamplePayload>>,
  ) {}

  async enqueue(opts: EnqueueExampleOptions): Promise<void> {
    const data: JobEnvelope<ExamplePayload> = {
      payload: opts.payload,
      ...(opts.correlationId === undefined ? {} : { correlationId: opts.correlationId }),
    };
    await this.queue.add(EXAMPLE_JOB_ECHO, data, { jobId: opts.jobId });
  }
}
