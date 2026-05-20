import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { type Queue } from 'bullmq';
import { type AppConfig } from '@app/config/env';
import { WebhooksService } from './webhooks.service';
import { type WebhookEnvelope } from './webhook.schema';
import { type JobEnvelope } from '@app/queues/job.types';
import { WEBHOOK_JOB_PROCESS } from './constants';

type WebhookQueue = Queue<JobEnvelope<WebhookEnvelope>>;

function buildEnv(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    WAHA_WEBHOOK_HMAC_HEADER: 'x-webhook-hmac',
    ...overrides,
  } as AppConfig;
}

function fakeQueue(): { queue: WebhookQueue; add: ReturnType<typeof vi.fn> } {
  const add = vi.fn(async () => undefined);
  const queue = { add } as unknown as WebhookQueue;
  return { queue, add };
}

const envelope: WebhookEnvelope = {
  id: 'evt-1',
  event: 'message',
  session: 's1',
  payload: { id: 'm1' },
};

describe('WebhooksService.verifySignature', () => {
  it('returns true when no secret is configured', () => {
    const { queue } = fakeQueue();
    const svc = new WebhooksService(buildEnv(), queue);
    expect(svc.verifySignature(Buffer.from('{}'), undefined)).toBe(true);
  });

  it('verifies a matching hex SHA-256 signature', () => {
    const { queue } = fakeQueue();
    const secret = 'topsecret';
    const svc = new WebhooksService(buildEnv({ WAHA_WEBHOOK_HMAC_SECRET: secret }), queue);
    const body = Buffer.from('{"event":"message"}');
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    expect(svc.verifySignature(body, sig)).toBe(true);
  });

  it('accepts the `sha256=...` prefix WAHA may add', () => {
    const { queue } = fakeQueue();
    const secret = 's';
    const svc = new WebhooksService(buildEnv({ WAHA_WEBHOOK_HMAC_SECRET: secret }), queue);
    const body = Buffer.from('abc');
    const sig = createHmac('sha256', secret).update(body).digest('hex');
    expect(svc.verifySignature(body, `sha256=${sig}`)).toBe(true);
  });

  it('rejects a tampered signature', () => {
    const { queue } = fakeQueue();
    const svc = new WebhooksService(buildEnv({ WAHA_WEBHOOK_HMAC_SECRET: 'k' }), queue);
    const body = Buffer.from('abc');
    expect(svc.verifySignature(body, 'deadbeef'.repeat(8))).toBe(false);
  });

  it('rejects when secret is set but no body or header given', () => {
    const { queue } = fakeQueue();
    const svc = new WebhooksService(buildEnv({ WAHA_WEBHOOK_HMAC_SECRET: 'k' }), queue);
    expect(svc.verifySignature(undefined, 'whatever')).toBe(false);
    expect(svc.verifySignature(Buffer.from('a'), undefined)).toBe(false);
  });
});

describe('WebhooksService.enqueue', () => {
  it('uses event.id as jobId for idempotency', async () => {
    const { queue, add } = fakeQueue();
    const svc = new WebhooksService(buildEnv(), queue);
    await svc.enqueue(envelope, 'corr-9');
    expect(add).toHaveBeenCalledTimes(1);
    const [name, data, opts] = add.mock.calls[0] ?? [];
    expect(name).toBe(WEBHOOK_JOB_PROCESS);
    expect(opts).toEqual({ jobId: 'evt-1' });
    expect(data).toEqual({ payload: envelope, correlationId: 'corr-9' });
  });

  it('omits correlationId when undefined', async () => {
    const { queue, add } = fakeQueue();
    const svc = new WebhooksService(buildEnv(), queue);
    await svc.enqueue(envelope, undefined);
    expect(add.mock.calls[0]?.[1]).toEqual({ payload: envelope });
  });
});
