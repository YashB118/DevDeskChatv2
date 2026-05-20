import { z } from 'zod';

/**
 * Realtime event contract — mirror of `backend/src/realtime/events.contract.ts`.
 *
 * Inbound: events the client emits (server validates via Zod). Outbound: events
 * the server emits (client validates via Zod). Keep schemas in sync with the
 * backend; drift will be caught by the integration tests in Phase 12.
 *
 * Phase 5 covers transport plumbing only — `ping`/`pong` plus
 * `error:invalid_payload`. Feature phases extend this contract.
 */

// ---------------- Inbound (client → server) ----------------

export const PingSchema = z.object({
  nonce: z.string().min(1).max(128),
  ts: z.number().int().nonnegative().optional(),
});
export type PingPayload = z.infer<typeof PingSchema>;

export const ChatsJoinSchema = z.object({
  chatIds: z.array(z.string().uuid()).min(1).max(100),
});
export type ChatsJoinPayload = z.infer<typeof ChatsJoinSchema>;

export const ChatsLeaveSchema = z.object({
  chatIds: z.array(z.string().uuid()).min(1).max(100),
});
export type ChatsLeavePayload = z.infer<typeof ChatsLeaveSchema>;

export const InboundEvents = {
  ping: PingSchema,
  'chats:join': ChatsJoinSchema,
  'chats:leave': ChatsLeaveSchema,
} as const;

export type InboundEventName = keyof typeof InboundEvents;
export type InboundPayload<E extends InboundEventName> = z.infer<(typeof InboundEvents)[E]>;

// ---------------- Outbound (server → client) ----------------

export const PongSchema = z.object({
  nonce: z.string().min(1),
  serverTs: z.number().int().nonnegative(),
  seq: z.number().int().nonnegative(),
});
export type PongPayload = z.infer<typeof PongSchema>;

export const InvalidPayloadSchema = z.object({
  event: z.string(),
  details: z.unknown().optional(),
});
export type InvalidPayloadEvent = z.infer<typeof InvalidPayloadSchema>;

// ---- Chats domain events (server → client) ----

export const ChatPreviewEventSchema = z.object({
  messageId: z.string(),
  preview: z.string(),
  ts: z.number().int().nonnegative(),
  fromSelf: z.boolean(),
});

export const MessageNewSchema = z.object({
  chatId: z.string(),
  message: z.object({
    id: z.string(),
    chatId: z.string(),
    senderId: z.string(),
    body: z.string(),
    ts: z.number().int().nonnegative(),
    type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'STICKER', 'SYSTEM']),
  }),
  preview: ChatPreviewEventSchema,
});
export type MessageNewPayload = z.infer<typeof MessageNewSchema>;

export const ChatAssignedSchema = z.object({
  chatId: z.string(),
  assignedTo: z.string(),
});
export type ChatAssignedPayload = z.infer<typeof ChatAssignedSchema>;

export const ChatUnassignedSchema = z.object({
  chatId: z.string(),
});
export type ChatUnassignedPayload = z.infer<typeof ChatUnassignedSchema>;

export const ChatReadSchema = z.object({
  chatId: z.string(),
  by: z.string(),
});
export type ChatReadPayload = z.infer<typeof ChatReadSchema>;

export const ChatMutedSchema = z.object({
  chatId: z.string(),
  muted: z.boolean(),
});
export type ChatMutedPayload = z.infer<typeof ChatMutedSchema>;

// ---- Messages domain events (server → client) ----

export const MessageAckSchema = z.object({
  chatId: z.string(),
  messageId: z.string(),
  state: z.enum(['SENT', 'DELIVERED', 'READ', 'PLAYED']),
});
export type MessageAckPayload = z.infer<typeof MessageAckSchema>;

export const MessageEditedSchema = z.object({
  chatId: z.string(),
  messageId: z.string(),
  body: z.string(),
  editedAt: z.number().int().nonnegative(),
});
export type MessageEditedPayload = z.infer<typeof MessageEditedSchema>;

export const MessageDeletedSchema = z.object({
  chatId: z.string(),
  messageId: z.string(),
  deletedAt: z.number().int().nonnegative(),
});
export type MessageDeletedPayload = z.infer<typeof MessageDeletedSchema>;

export const MessageReactionSchema = z.object({
  chatId: z.string(),
  messageId: z.string(),
  userId: z.string(),
  emoji: z.string().nullable(),
});
export type MessageReactionPayload = z.infer<typeof MessageReactionSchema>;

// ---- Admin / sessions domain events (server → client) ----

export const SessionStatusValues = [
  'STARTING',
  'SCAN_QR_CODE',
  'WORKING',
  'STOPPED',
  'FAILED',
] as const;
export const SessionStatusEnum = z.enum(SessionStatusValues);
export type SessionStatusValue = z.infer<typeof SessionStatusEnum>;

export const SessionStatusSchema = z.object({
  name: z.string().min(1),
  status: SessionStatusEnum,
});
export type SessionStatusPayload = z.infer<typeof SessionStatusSchema>;

export const UserUpdatedSchema = z.object({
  id: z.string().min(1),
  disabled: z.boolean().optional(),
  role: z.enum(['ADMIN', 'DEVELOPER']).optional(),
});
export type UserUpdatedPayload = z.infer<typeof UserUpdatedSchema>;

export const FeedbackNewSchema = z.object({
  id: z.string().min(1),
  ts: z.number().int().nonnegative(),
});
export type FeedbackNewPayload = z.infer<typeof FeedbackNewSchema>;

export const OutboundEvents = {
  pong: PongSchema,
  'error:invalid_payload': InvalidPayloadSchema,
  'message:new': MessageNewSchema,
  'message:ack': MessageAckSchema,
  'message:edited': MessageEditedSchema,
  'message:deleted': MessageDeletedSchema,
  'message:reaction': MessageReactionSchema,
  'chat:assigned': ChatAssignedSchema,
  'chat:unassigned': ChatUnassignedSchema,
  'chat:read': ChatReadSchema,
  'chat:muted': ChatMutedSchema,
  'session:status': SessionStatusSchema,
  'user:updated': UserUpdatedSchema,
  'feedback:new': FeedbackNewSchema,
} as const;

export type OutboundEventName = keyof typeof OutboundEvents;
export type OutboundPayload<E extends OutboundEventName> = z.infer<(typeof OutboundEvents)[E]>;
