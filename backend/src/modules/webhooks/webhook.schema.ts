import { z } from 'zod';

/**
 * WAHA delivers webhooks as a single envelope. We keep the schema permissive
 * on the inner `payload` so unknown events don't get dropped at the edge —
 * `WebhookProcessor` is the authoritative dispatcher.
 */
export const WebhookEventTypes = [
  'message',
  'message.any',
  'message.ack',
  'message.edited',
  'message.reaction',
  'message.revoked',
  'session.status',
  'group.v2.participants',
  'group.v2.join',
  'group.v2.leave',
  'presence.update',
  'state.change',
] as const;
export type WebhookEventType = (typeof WebhookEventTypes)[number];

export const WebhookEnvelopeSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  session: z.string().min(1),
  timestamp: z.number().optional(),
  payload: z.unknown(),
  me: z.unknown().optional(),
  engine: z.string().optional(),
  environment: z.record(z.unknown()).optional(),
});
export type WebhookEnvelope = z.infer<typeof WebhookEnvelopeSchema>;

export interface NormalizedWebhookEvent {
  id: string;
  event: string;
  session: string;
  timestamp: number | undefined;
  payload: unknown;
}
