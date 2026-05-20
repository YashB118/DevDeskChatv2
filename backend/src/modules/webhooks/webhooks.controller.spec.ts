import { describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { type Request } from 'express';
import { WebhooksController } from './webhooks.controller';
import { type WebhooksService } from './webhooks.service';
import { type WebhookEnvelope } from './webhook.schema';

function buildService(opts: { verify?: boolean; header?: string }): WebhooksService {
  return {
    hmacHeaderName: vi.fn(() => opts.header ?? 'x-webhook-hmac'),
    verifySignature: vi.fn(() => opts.verify ?? true),
    enqueue: vi.fn(async () => undefined),
  } as unknown as WebhooksService;
}

function buildReq(headers: Record<string, string | string[]> = {}): Request {
  return { headers, rawBody: Buffer.from('{}') } as unknown as Request;
}

const envelope: WebhookEnvelope = {
  id: 'evt-1',
  event: 'message',
  session: 's1',
  payload: {},
};

describe('WebhooksController', () => {
  it('enqueues and returns { accepted: true } on a valid signature', async () => {
    const service = buildService({ verify: true });
    const controller = new WebhooksController(service);
    const result = await controller.ingest(buildReq(), envelope, 'corr-1');
    expect(result).toEqual({ accepted: true });
    expect(service.enqueue).toHaveBeenCalledWith(envelope, 'corr-1');
  });

  it('rejects with UnauthorizedException when verify returns false', async () => {
    const service = buildService({ verify: false });
    const controller = new WebhooksController(service);
    await expect(controller.ingest(buildReq(), envelope, undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(service.enqueue).not.toHaveBeenCalled();
  });

  it('reads the HMAC header (case-insensitive) and forwards it to verifySignature', async () => {
    const service = buildService({ verify: true, header: 'X-Webhook-Hmac' });
    const verify = service.verifySignature as ReturnType<typeof vi.fn>;
    const controller = new WebhooksController(service);
    await controller.ingest(buildReq({ 'x-webhook-hmac': 'abc123' }), envelope, undefined);
    expect(verify).toHaveBeenCalledWith(expect.any(Buffer), 'abc123');
  });
});
