import { describe, expect, it, vi } from 'vitest';
import { type Job } from 'bullmq';
import { ExampleProcessor } from './example.processor';
import { WorkerHarness } from './worker.harness';
import { type JobEnvelope } from './job.types';
import { type ExamplePayload } from './example.queue';

function fakeJob(payload: ExamplePayload): Job<JobEnvelope<unknown>> {
  return {
    id: 'j1',
    name: 'example.echo',
    queueName: 'example',
    attemptsMade: 0,
    data: { payload },
  } as unknown as Job<JobEnvelope<unknown>>;
}

describe('ExampleProcessor', () => {
  it('echoes the validated payload through the harness', async () => {
    const harness = new WorkerHarness();
    const runSpy = vi.spyOn(harness, 'run');
    const processor = new ExampleProcessor(harness);
    const result = await processor.process(fakeJob({ message: 'caveman echo' }));
    expect(result).toEqual({ echoed: 'caveman echo' });
    expect(runSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects payloads that fail schema validation', async () => {
    const processor = new ExampleProcessor(new WorkerHarness());
    const bad = {
      id: 'j2',
      name: 'example.echo',
      queueName: 'example',
      attemptsMade: 0,
      data: { payload: { message: '' } },
    } as unknown as Job<JobEnvelope<unknown>>;
    await expect(processor.process(bad)).rejects.toThrow(/Invalid queue payload/);
  });
});
