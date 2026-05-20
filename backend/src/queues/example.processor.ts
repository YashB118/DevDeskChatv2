import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { type Job } from 'bullmq';
import { EXAMPLE_QUEUE } from './constants';
import { ExamplePayloadSchema, type ExamplePayload } from './example.queue';
import { type JobEnvelope } from './job.types';
import { WorkerHarness } from './worker.harness';

export interface ExampleJobResult {
  echoed: string;
}

@Processor(EXAMPLE_QUEUE)
export class ExampleProcessor extends WorkerHost {
  private readonly logger = new Logger(ExampleProcessor.name);

  constructor(private readonly harness: WorkerHarness) {
    super();
  }

  async process(job: Job<JobEnvelope<unknown>>): Promise<ExampleJobResult> {
    return this.harness.run(job, ExamplePayloadSchema, (payload: ExamplePayload) => {
      this.logger.debug(`example.echo received message length=${String(payload.message.length)}`);
      return Promise.resolve({ echoed: payload.message });
    });
  }
}
