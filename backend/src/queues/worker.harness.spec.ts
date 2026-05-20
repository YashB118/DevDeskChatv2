import { describe, expect, it, vi } from 'vitest';
import { type Job } from 'bullmq';
import { z } from 'zod';
import { ValidationError } from '@app/shared/errors';
import { WorkerHarness } from './worker.harness';
import { type JobEnvelope } from './job.types';

const Schema = z.object({ value: z.number().int() });

interface FakeJobOpts {
  id?: string;
  name?: string;
  queueName?: string;
  attemptsMade?: number;
  data?: Partial<JobEnvelope<unknown>>;
}

function fakeJob(opts: FakeJobOpts = {}): Job<JobEnvelope<unknown>> {
  return {
    id: opts.id ?? 'job-1',
    name: opts.name ?? 'example.echo',
    queueName: opts.queueName ?? 'example',
    attemptsMade: opts.attemptsMade ?? 0,
    data: { payload: { value: 1 }, ...opts.data },
  } as unknown as Job<JobEnvelope<unknown>>;
}

describe('WorkerHarness', () => {
  it('parses payload via schema and invokes handler', async () => {
    const harness = new WorkerHarness();
    const handler = vi.fn(async (p: { value: number }) => p.value * 2);
    const result = await harness.run(fakeJob(), Schema, handler);
    expect(result).toBe(2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toEqual({ value: 1 });
  });

  it('forwards correlationId, jobId, attempt into the handler ctx', async () => {
    const harness = new WorkerHarness();
    const received: unknown[] = [];
    await harness.run(
      fakeJob({
        id: 'abc',
        attemptsMade: 2,
        data: { payload: { value: 7 }, correlationId: 'corr-9' },
      }),
      Schema,
      async (payload, ctx) => {
        received.push(payload, ctx);
        return 'ok';
      },
    );
    expect(received[1]).toEqual({
      correlationId: 'corr-9',
      jobId: 'abc',
      attempt: 3,
    });
  });

  it('throws ValidationError for malformed payloads without calling handler', async () => {
    const harness = new WorkerHarness();
    const handler = vi.fn();
    const job = fakeJob({ data: { payload: { value: 'not-a-number' } } });
    await expect(harness.run(job, Schema, handler)).rejects.toBeInstanceOf(ValidationError);
    expect(handler).not.toHaveBeenCalled();
  });

  it('rethrows handler failures so BullMQ can retry', async () => {
    const harness = new WorkerHarness();
    const boom = new Error('downstream blew up');
    await expect(
      harness.run(fakeJob(), Schema, async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

  it('emits a success log carrying queue+jobId+durationMs', async () => {
    const harness = new WorkerHarness();
    const logged: string[] = [];
    const spy = vi
      .spyOn((harness as unknown as { logger: { log: (m: string) => void } }).logger, 'log')
      .mockImplementation((msg: string) => {
        logged.push(msg);
      });
    await harness.run(fakeJob({ id: 'j7', queueName: 'webhook-waha' }), Schema, async () => 'k');
    spy.mockRestore();
    const success = logged.find((m) => m.startsWith('queue.job.success'));
    expect(success).toBeDefined();
    expect(success).toContain('queue=webhook-waha');
    expect(success).toContain('jobId=j7');
    expect(success).toContain('durationMs=');
  });

  it('emits a failure log when the handler throws', async () => {
    const harness = new WorkerHarness();
    const errors: string[] = [];
    const spy = vi
      .spyOn((harness as unknown as { logger: { error: (m: string) => void } }).logger, 'error')
      .mockImplementation((msg: string) => {
        errors.push(msg);
      });
    await expect(
      harness.run(fakeJob(), Schema, async () => {
        throw new Error('nope');
      }),
    ).rejects.toThrow('nope');
    spy.mockRestore();
    const failure = errors.find((m) => m.startsWith('queue.job.failure'));
    expect(failure).toBeDefined();
    expect(failure).toContain('errMessage=nope');
  });
});
