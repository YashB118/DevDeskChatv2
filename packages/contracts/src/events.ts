import { z } from 'zod';

/**
 * Shared realtime event contract — single source of truth for backend and frontend.
 *
 * Backend (`SocketEmitter.checkPayload`) and frontend (`useSocketEvent`) both
 * import schemas from here. Drift is impossible at compile time.
 *
 * Inbound: events the client emits. Each must be applied at the backend's
 * @MessageBody via ZodValidationPipe(schema).
 * Outbound: events the server emits. Frontend validates inbound payloads;
 * backend validates outbound payloads in non-production via SocketEmitter.
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

// Note: chatIds emitted on outbound events use the upstream WAHA chat ID
// format (e.g. `<lid>@lid` or `<jid>@s.whatsapp.net`), NOT a uuid. The
// inbound `chats:join` schema keeps the uuid constraint until the chat list
// lives in the UI.

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

// ----- Messages domain (canonical: backend shape) -----

export const MessageDtoSchema = z.object({
  id: z.string().min(1),
  chatId: z.string().min(1),
  stanzaId: z.string().min(1),
  fromJid: z.string().min(1),
  fromMe: z.boolean(),
  body: z.string().nullable(),
  type: z.string().min(1),
  sentAt: z.string().datetime(),
});
export type MessageDto = z.infer<typeof MessageDtoSchema>;

export const MessageNewSchema = z.object({
  chatId: z.string().min(1),
  message: MessageDtoSchema,
});
export type MessageNewPayload = z.infer<typeof MessageNewSchema>;

export const MessageAckSchema = z.object({
  chatId: z.string().min(1),
  stanzaId: z.string().min(1),
  ack: z.enum(['SENT', 'DELIVERED', 'READ', 'PLAYED', 'FAILED']),
});
export type MessageAckPayload = z.infer<typeof MessageAckSchema>;

export const MessageEditedSchema = z.object({
  chatId: z.string().min(1),
  stanzaId: z.string().min(1),
  newBody: z.string().nullable(),
  editedAt: z.string().datetime(),
});
export type MessageEditedPayload = z.infer<typeof MessageEditedSchema>;

export const MessageDeletedSchema = z.object({
  chatId: z.string().min(1),
  stanzaId: z.string().min(1),
  deletedAt: z.string().datetime(),
});
export type MessageDeletedPayload = z.infer<typeof MessageDeletedSchema>;

export const MessageReactionSchema = z.object({
  chatId: z.string().min(1),
  stanzaId: z.string().min(1),
  senderJid: z.string().min(1),
  emoji: z.string().min(1),
  removed: z.boolean(),
});
export type MessageReactionPayload = z.infer<typeof MessageReactionSchema>;

// ----- Sessions / groups -----

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

export const GroupParticipantsSchema = z.object({
  chatId: z.string().min(1),
  action: z.enum(['add', 'remove', 'promote', 'demote']),
  participants: z.array(z.string().min(1)),
});
export type GroupParticipantsPayload = z.infer<typeof GroupParticipantsSchema>;

// ----- Collaboration -----

export const ChatAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  userId: z.string().uuid(),
  chatId: z.string().min(1),
  assignedBy: z.string().uuid().nullable(),
  assignedAt: z.string().datetime(),
});
export type ChatAssignmentPayload = z.infer<typeof ChatAssignmentSchema>;

export const ChatUnassignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  userId: z.string().uuid(),
  chatId: z.string().min(1),
  unassignedBy: z.string().uuid().nullable(),
  unassignedAt: z.string().datetime(),
});
export type ChatUnassignmentPayload = z.infer<typeof ChatUnassignmentSchema>;

// ----- Backend Phase 6 emits (frontend already listens) -----

export const ChatReadSchema = z.object({
  chatId: z.string().min(1),
  by: z.string().min(1),
});
export type ChatReadPayload = z.infer<typeof ChatReadSchema>;

export const ChatMutedSchema = z.object({
  chatId: z.string().min(1),
  muted: z.boolean(),
});
export type ChatMutedPayload = z.infer<typeof ChatMutedSchema>;

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
  'session:status': SessionStatusSchema,
  'group:participants': GroupParticipantsSchema,
  'chat:assigned': ChatAssignmentSchema,
  'chat:unassigned': ChatUnassignmentSchema,
  'chat:read': ChatReadSchema,
  'chat:muted': ChatMutedSchema,
  'user:updated': UserUpdatedSchema,
  'feedback:new': FeedbackNewSchema,
} as const;

export type OutboundEventName = keyof typeof OutboundEvents;
export type OutboundPayload<E extends OutboundEventName> = z.infer<(typeof OutboundEvents)[E]>;
