import { z } from 'zod';

export const MessageTypeSchema = z.enum([
  'TEXT',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'DOCUMENT',
  'STICKER',
  'SYSTEM',
]);
export type MessageType = z.infer<typeof MessageTypeSchema>;

export const AckStateSchema = z.enum(['SENT', 'DELIVERED', 'READ', 'PLAYED', 'FAILED']);
export type AckState = z.infer<typeof AckStateSchema>;

export const ReactionSchema = z.object({
  emoji: z.string().min(1).max(8),
  userId: z.string(),
});
export type Reaction = z.infer<typeof ReactionSchema>;

export const QuotedRefSchema = z.object({
  messageId: z.string(),
  authorId: z.string(),
  preview: z.string(),
});
export type QuotedRef = z.infer<typeof QuotedRefSchema>;

export const MessageStatusSchema = z.enum(['pending', 'failed', 'confirmed']);
export type MessageStatus = z.infer<typeof MessageStatusSchema>;

export const MessageDTOSchema = z.object({
  id: z.string().min(1),
  /** WhatsApp wire id — required for edit/delete/react/forward URL params. */
  stanzaId: z.string().min(1),
  chatId: z.string().min(1),
  senderId: z.string().min(1),
  senderName: z.string().optional(),
  body: z.string(),
  type: MessageTypeSchema,
  ts: z.number().int().nonnegative(),
  editedAt: z.number().int().nonnegative().nullable().optional(),
  deletedAt: z.number().int().nonnegative().nullable().optional(),
  ackState: AckStateSchema.optional(),
  reactions: z.array(ReactionSchema).default([]),
  quoted: QuotedRefSchema.nullable().optional(),
  forwarded: z.boolean().default(false),
  media: z
    .object({
      url: z.string(),
      mime: z.string(),
      size: z.number().int().nonnegative(),
      width: z.number().int().nonnegative().optional(),
      height: z.number().int().nonnegative().optional(),
      durationMs: z.number().int().nonnegative().optional(),
    })
    .nullable()
    .optional(),
  status: MessageStatusSchema.default('confirmed'),
  tempId: z.string().optional(),
});
export type MessageDTO = z.infer<typeof MessageDTOSchema>;

export const MessagePageSchema = z.object({
  items: z.array(MessageDTOSchema),
  nextCursor: z.string().nullable(),
});
export type MessagePage = z.infer<typeof MessagePageSchema>;

export interface SendMessageInput {
  body: string;
  type?: MessageType;
  quoted?: QuotedRef | null;
  mentions?: readonly string[];
}

/** Backend `POST /api/messages/:chatId/send` response. */
export interface SendMessageResponse {
  id: string;
  stanzaId: string;
}

// ----- Backend wire shapes (for the API-layer adapter) -----

const BackendReactionSchema = z.object({
  senderJid: z.string(),
  emoji: z.string(),
  createdAt: z.string(),
});

const BackendEditSchema = z.object({
  previousBody: z.string().nullable(),
  newBody: z.string().nullable(),
  editedAt: z.string(),
});

const BackendQuoteSchema = z
  .object({
    quotedStanzaId: z.string(),
    quotedBody: z.string().nullable(),
  })
  .nullable();

export const BackendMessageResponseSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  stanzaId: z.string(),
  fromJid: z.string(),
  fromMe: z.boolean(),
  body: z.string().nullable(),
  type: z.string(),
  sentAt: z.string(),
  rowId: z.number().int().nullable(),
  deleted: z.boolean(),
  reactions: z.array(BackendReactionSchema),
  mentions: z.array(z.string()),
  edits: z.array(BackendEditSchema),
  quote: BackendQuoteSchema,
});
export type BackendMessageResponse = z.infer<typeof BackendMessageResponseSchema>;

export const BackendMessageListResponseSchema = z.object({
  messages: z.array(BackendMessageResponseSchema),
});
