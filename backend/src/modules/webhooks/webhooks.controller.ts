import { Controller, HttpCode, HttpStatus, Post, Req, UnauthorizedException } from '@nestjs/common';
import { type Request } from 'express';
import { Public } from '@app/common/decorators/public.decorator';
import { ZodBody } from '@app/common/decorators/zod-body.decorator';
import { CorrelationId } from '@app/common/decorators/correlation-id.decorator';
import { WebhookEnvelopeSchema, type WebhookEnvelope } from './webhook.schema';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks/waha')
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  /**
   * Single ingress for WAHA → DevChatDesk. Validates the envelope, checks
   * the optional HMAC signature, then immediately enqueues the job and
   * returns 200. All real work happens in `WebhookProcessor`.
   */
  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async ingest(
    @Req() req: Request,
    @ZodBody(WebhookEnvelopeSchema) body: WebhookEnvelope,
    @CorrelationId() correlationId: string | undefined,
  ): Promise<{ accepted: true }> {
    const signature = this.readHeader(req, this.service.hmacHeaderName());
    if (!this.service.verifySignature(req.rawBody, signature)) {
      throw new UnauthorizedException('invalid webhook signature');
    }
    if (!this.service.isFresh(body)) {
      throw new UnauthorizedException('webhook timestamp outside acceptable window');
    }
    await this.service.enqueue(body, correlationId);
    return { accepted: true };
  }

  private readHeader(req: Request, name: string): string | undefined {
    const v = req.headers[name.toLowerCase()];
    if (Array.isArray(v)) return v[0];
    return v;
  }
}
