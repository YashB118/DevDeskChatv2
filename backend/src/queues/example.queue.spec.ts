import { describe, expect, it, vi } from 'vitest';
import { type Queue } from 'bullmq';
import { EXAMPLE_JOB_ECHO, ExampleQueueProducer, type ExamplePayload } from './example.queue';
import { type JobEnvelope } from './job.types';

type ExampleQueue = Queue<JobEnvelope<ExamplePayload>>;

function fakeQueue(): { queue: ExampleQueue; add: ReturnType<typeof vi.fn> } {
  const add = vi.fn(async () => undefined);
  const queue = { add } as unknown as ExampleQueue;
  return { queue, add };
}

describe('ExampleQueueProducer', () => {
  it('adds a job with jobId for idempotency and unwraps the envelope', async () => {
    const { queue, add } = fakeQueue();
    const producer = new ExampleQueueProducer(queue);
    await producer.enqueue({
      jobId: 'job-key-1',
      payload: { message: 'hello' },
      correlationId: 'corr-1',
    });
    expect(add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = add.mock.calls[0] ?? [];
    expect(name).toBe(EXAMPLE_JOB_ECHO);
    expect(data).toEqual({ payload: { message: 'hello' }, correlationId: 'corr-1' });
    expect(opts).toEqual({ jobId: 'job-key-1' });
  });

  it('omits correlationId when not provided', async () => {
    const { queue, add } = fakeQueue();
    const producer = new ExampleQueueProducer(queue);
    await producer.enqueue({ jobId: 'jid', payload: { message: 'hi' } });
    expect(add.mock.calls[0]?.[1]).toEqual({ payload: { message: 'hi' } });
  });
});
