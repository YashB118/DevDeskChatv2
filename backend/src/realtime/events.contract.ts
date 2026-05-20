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

export const OutboundEvents = {
  pong: PongSchema,
  'error:invalid_payload': InvalidPayloadSchema,
} as const;

export type OutboundEventName = keyof typeof OutboundEvents;
export type OutboundPayload<E extends OutboundEventName> = z.infer<(typeof OutboundEvents)[E]>;
