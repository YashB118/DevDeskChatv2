import { z } from 'zod';

export const SendTextSchema = z.object({
  session: z.string().min(1).max(128),
  text: z.string().min(1).max(8000),
  quotedStanzaId: z.string().min(1).optional(),
  mentions: z.array(z.string().min(1)).max(50).optional(),
});
export type SendTextInput = z.infer<typeof SendTextSchema>;

export const SendMediaSchema = z.object({
  session: z.string().min(1).max(128),
  mimetype: z.string().min(1).max(255),
  data: z.string().min(1).optional(),
  url: z.string().url().optional(),
  filename: z.string().min(1).max(255).optional(),
  caption: z.string().max(8000).optional(),
  asDocument: z.boolean().optional(),
});
export type SendMediaInput = z.infer<typeof SendMediaSchema>;

export const EditMessageSchema = z.object({
  session: z.string().min(1).max(128),
  text: z.string().min(1).max(8000),
});
export type EditMessageInput = z.infer<typeof EditMessageSchema>;

export const DeleteMessageSchema = z.object({
  session: z.string().min(1).max(128),
});
export type DeleteMessageInput = z.infer<typeof DeleteMessageSchema>;

export const ReactSchema = z.object({
  session: z.string().min(1).max(128),
  emoji: z.string().min(1).max(16),
});
export type ReactInput = z.infer<typeof ReactSchema>;

export const ForwardSchema = z.object({
  session: z.string().min(1).max(128),
  toChatId: z.string().min(1).max(128),
});
export type ForwardInput = z.infer<typeof ForwardSchema>;

export const ListMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  beforeSentAt: z.coerce.date().optional(),
  beforeStanzaId: z.string().min(1).optional(),
});
export type ListMessagesQuery = z.infer<typeof ListMessagesQuerySchema>;
