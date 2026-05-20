import { Injectable, Logger } from '@nestjs/common';
import { type Job } from 'bullmq';
import { ZodError, type ZodTypeAny } from 'zod';
import { ValidationError } from '@app/shared/errors';
import { type JobEnvelope, type PayloadOf } from './job.types';

export interface HarnessContext {
  correlationId: string | undefined;
  jobId: string | undefined;
  attempt: number;
}

export interface JobOutcome<R> {
  result: R;
  durationMs: number;
}

/**
 * Common pre/post wrapper invoked from every `@Processor`. Zod-parses the
 * payload, attaches structured fields (queue/jobId/attempt/correlationId)
 * to start/success/failure logs, and rethrows so BullMQ can retry.
 *
 * Prom-client instrumentation is wired in Phase 10; the `durationMs`
 * field on every success/failure log is the metric carrier until then.
 */
@Injectable()
export class WorkerHarness {
  private readonly logger = new Logger('QueueWorker');

  async run<S extends ZodTypeAny, R>(
    job: Job<JobEnvelope<unknown>>,
    schema: S,
    handler: (payload: PayloadOf<S>, ctx: HarnessContext) => Promise<R>,
  ): Promise<R> {
    const start = process.hrtime.bigint();
    const ctx: HarnessContext = {
      correlationId: job.data.correlationId,
      jobId: job.id,
      attempt: job.attemptsMade + 1,
    };
    const base = this.fields(job, ctx);

    const parsed = this.parsePayload(job, schema, base);

    this.logger.log(`queue.job.start ${this.format(base)}`);
    try {
      const result = await handler(parsed, ctx);
      const durationMs = this.elapsedMs(start);
      this.logger.log(`queue.job.success ${this.format({ ...base, durationMs })}`);
      return result;
    } catch (err) {
      const durationMs = this.elapsedMs(start);
      const message = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : 'UnknownError';
      this.logger.error(
        `queue.job.failure ${this.format({ ...base, durationMs, errName: name, errMessage: message })}`,
      );
      throw err;
    }
  }

  private parsePayload<S extends ZodTypeAny>(
    job: Job<JobEnvelope<unknown>>,
    schema: S,
    base: Record<string, unknown>,
  ): PayloadOf<S> {
    try {
      return schema.parse(job.data.payload) as PayloadOf<S>;
    } catch (err) {
      if (err instanceof ZodError) {
        this.logger.error(
          `queue.job.invalid_payload ${this.format({ ...base, issues: JSON.stringify(err.issues) })}`,
        );
        throw new ValidationError('Invalid queue payload', { issues: err.issues });
      }
      throw err;
    }
  }

  private fields(job: Job<JobEnvelope<unknown>>, ctx: HarnessContext): Record<string, unknown> {
    return {
      queue: job.queueName,
      jobId: ctx.jobId,
      jobName: job.name,
      attempt: ctx.attempt,
      correlationId: ctx.correlationId,
    };
  }

  private format(fields: Record<string, unknown>): string {
    return Object.entries(fields)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
      .join(' ');
  }

  private elapsedMs(startNs: bigint): number {
    return Number(process.hrtime.bigint() - startNs) / 1_000_000;
  }
}
