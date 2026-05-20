import { type NormalizedWebhookEvent } from './webhook.schema';

export interface WebhookHandler {
  handle(event: NormalizedWebhookEvent): Promise<void>;
}

export const MESSAGE_HANDLER = Symbol('WEBHOOK_MESSAGE_HANDLER');
export const MESSAGE_ACK_HANDLER = Symbol('WEBHOOK_MESSAGE_ACK_HANDLER');
export const MESSAGE_EDITED_HANDLER = Symbol('WEBHOOK_MESSAGE_EDITED_HANDLER');
export const MESSAGE_REACTION_HANDLER = Symbol('WEBHOOK_MESSAGE_REACTION_HANDLER');
export const MESSAGE_REVOKED_HANDLER = Symbol('WEBHOOK_MESSAGE_REVOKED_HANDLER');
export const SESSION_STATUS_HANDLER = Symbol('WEBHOOK_SESSION_STATUS_HANDLER');
export const GROUP_PARTICIPANTS_HANDLER = Symbol('WEBHOOK_GROUP_PARTICIPANTS_HANDLER');
