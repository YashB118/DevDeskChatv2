import { describe, expect, it, vi } from 'vitest';
import { type Job } from 'bullmq';
import { WebhookProcessor } from './webhook.processor';
import { WorkerHarness } from './worker.harness';
import { type WahaStoreService } from '@app/integrations/waha-store/waha-store.service';
import { type WebhookDispatch } from '@app/modules/webhooks/dispatch';
import {
  type NormalizedWebhookEvent,
  type WebhookEnvelope,
} from '@app/modules/webhooks/webhook.schema';
import { type JobEnvelope } from './job.types';

function fakeJob(envelope: Partial<WebhookEnvelope>, id = 'job-1'): Job<JobEnvelope<unknown>> {
  return {
    id,
    name: 'webhook.process',
    queueName: 'webhook-waha',
    attemptsMade: 0,
    data: { payload: { id: 'evt-1', event: 'message', session: 's1', ...envelope } },
  } as unknown as Job<JobEnvelope<unknown>>;
}

function buildStore(map: Record<string, string | null>): WahaStoreService {
  return {
    phoneToLid: vi.fn(async (_s: string, phone: string) => map[phone] ?? null),
  } as unknown as WahaStoreService;
}

function buildDispatch(): { dispatch: WebhookDispatch; calls: NormalizedWebhookEvent[] } {
  const calls: NormalizedWebhookEvent[] = [];
  const dispatch = {
    dispatch: vi.fn(async (event: NormalizedWebhookEvent) => {
      calls.push(event);
    }),
  } as unknown as WebhookDispatch;
  return { dispatch, calls };
}

describe('WebhookProcessor', () => {
  it('normalizes phone-format JIDs in nested payload values', async () => {
    const store = buildStore({
      '15551234@s.whatsapp.net': '999@lid',
      '15555678@s.whatsapp.net': '888@lid',
    });
    const { dispatch, calls } = buildDispatch();
    const processor = new WebhookProcessor(new WorkerHarness(), store, dispatch);

    const job = fakeJob({
      payload: {
        from: '15551234@s.whatsapp.net',
        to: 'already@lid',
        mentions: ['15555678@s.whatsapp.net', '777@lid'],
        nested: { participant: '15551234@s.whatsapp.net' },
      },
    });
    await processor.process(job);

    expect(calls).toHaveLength(1);
    const normalized = calls[0]?.payload as Record<string, unknown>;
    expect(normalized.from).toBe('999@lid');
    expect(normalized.to).toBe('already@lid');
    expect(normalized.mentions).toEqual(['888@lid', '777@lid']);
    expect((normalized.nested as Record<string, unknown>).participant).toBe('999@lid');
  });

  it('leaves unresolved phone JIDs intact', async () => {
    const store = buildStore({});
    const { dispatch, calls } = buildDispatch();
    const processor = new WebhookProcessor(new WorkerHarness(), store, dispatch);
    await processor.process(fakeJob({ payload: { from: '15559999@s.whatsapp.net' } }));
    const normalized = calls[0]?.payload as Record<string, unknown>;
    expect(normalized.from).toBe('15559999@s.whatsapp.net');
  });

  it('passes already-LID JIDs through without lookup', async () => {
    const phoneToLid = vi.fn(async () => null);
    const store = { phoneToLid } as unknown as WahaStoreService;
    const { dispatch } = buildDispatch();
    const processor = new WebhookProcessor(new WorkerHarness(), store, dispatch);
    await processor.process(fakeJob({ payload: { from: '999@lid' } }));
    expect(phoneToLid).not.toHaveBeenCalled();
  });

  it('rejects payloads that fail envelope validation', async () => {
    const store = buildStore({});
    const { dispatch } = buildDispatch();
    const processor = new WebhookProcessor(new WorkerHarness(), store, dispatch);
    const bad = {
      id: 'j',
      name: 'webhook.process',
      queueName: 'webhook-waha',
      attemptsMade: 0,
      data: { payload: { event: 'message' /* missing id + session */ } },
    } as unknown as Job<JobEnvelope<unknown>>;
    await expect(processor.process(bad)).rejects.toThrow(/Invalid queue payload/);
  });
});
