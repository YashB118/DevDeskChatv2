import { z } from 'zod';

/**
 * Realtime event contract.
 *
 * Inbound: events the client emits. Each must define a Zod schema applied at @MessageBody.
 * Outbound: events the server emits. SocketEmitter validates payloads in non-production.
 *
 * Future phases extend this contract (chats, messages, presence, etc.). For Phase 4
 * only `ping` / `pong` exists as a smoke test for the transport.
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
// inbound `chats:join` schema kept the uuid constraint from Phase 4 but
// will relax once the chat list lives in the UI.

export const InboundEvents = {
  ping: PingSchema,
  'chats:join': ChatsJoinSchema,
  'chats:leave': ChatsLeaveSchema,
} as const;

export type InboundEventName = keyof typeof InboundEvents;

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

// ----- Domain (Phase 8) -----

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
export const MessageAckSchema = z.object({
  chatId: z.string().min(1),
  stanzaId: z.string().min(1),
  ack: z.enum(['SENT', 'DELIVERED', 'READ', 'PLAYED', 'FAILED']),
});
export const MessageEditedSchema = z.object({
  chatId: z.string().min(1),
  stanzaId: z.string().min(1),
  newBody: z.string().nullable(),
  editedAt: z.string().datetime(),
});
export const MessageDeletedSchema = z.object({
  chatId: z.string().min(1),
  stanzaId: z.string().min(1),
  deletedAt: z.string().datetime(),
});
export const MessageReactionSchema = z.object({
  chatId: z.string().min(1),
  stanzaId: z.string().min(1),
  senderJid: z.string().min(1),
  emoji: z.string().min(1),
  removed: z.boolean(),
});
export const SessionStatusSchema = z.object({
  name: z.string().min(1),
  status: z.enum(['STARTING', 'SCAN_QR_CODE', 'WORKING', 'STOPPED', 'FAILED']),
});
export const GroupParticipantsSchema = z.object({
  chatId: z.string().min(1),
  action: z.enum(['add', 'remove', 'promote', 'demote']),
  participants: z.array(z.string().min(1)),
});

// ----- Collaboration (Phase 9) -----

export const ChatAssignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  userId: z.string().uuid(),
  chatId: z.string().min(1),
  assignedBy: z.string().uuid().nullable(),
  assignedAt: z.string().datetime(),
});

export const ChatUnassignmentSchema = z.object({
  assignmentId: z.string().uuid(),
  userId: z.string().uuid(),
  chatId: z.string().min(1),
  unassignedBy: z.string().uuid().nullable(),
  unassignedAt: z.string().datetime(),
});

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
} as const;

export type OutboundEventName = keyof typeof OutboundEvents;
export type OutboundPayload<E extends OutboundEventName> = z.infer<(typeof OutboundEvents)[E]>;
