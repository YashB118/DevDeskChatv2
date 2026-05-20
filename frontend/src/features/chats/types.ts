import { z } from 'zod';

export const ChatKindSchema = z.enum(['INDIVIDUAL', 'GROUP', 'BROADCAST']);
export type ChatKind = z.infer<typeof ChatKindSchema>;

export const ChatPreviewSchema = z.object({
  messageId: z.string(),
  preview: z.string(),
  ts: z.number().int().nonnegative(),
  fromSelf: z.boolean(),
});
export type ChatPreview = z.infer<typeof ChatPreviewSchema>;

export const ChatDTOSchema = z.object({
  id: z.string().min(1),
  kind: ChatKindSchema,
  title: z.string(),
  avatarUrl: z.string().url().nullable().optional(),
  unreadCount: z.number().int().nonnegative(),
  muted: z.boolean(),
  pinned: z.boolean().default(false),
  assignedTo: z.string().nullable(),
  sessionId: z.string().nullable(),
  lastMessage: ChatPreviewSchema.nullable(),
  updatedAt: z.number().int().nonnegative(),
});
export type ChatDTO = z.infer<typeof ChatDTOSchema>;

export const ChatListPageSchema = z.object({
  items: z.array(ChatDTOSchema),
  nextCursor: z.string().nullable(),
});
export type ChatListPage = z.infer<typeof ChatListPageSchema>;

export const ChatFiltersSchema = z.object({
  unreadOnly: z.boolean().default(false),
  assignedToMe: z.boolean().default(false),
  hideMuted: z.boolean().default(false),
  kinds: z.array(ChatKindSchema).default(['INDIVIDUAL', 'GROUP', 'BROADCAST']),
  sessionId: z.string().nullable().default(null),
});
export type ChatFilters = z.infer<typeof ChatFiltersSchema>;

export const DEFAULT_FILTERS: ChatFilters = {
  unreadOnly: false,
  assignedToMe: false,
  hideMuted: false,
  kinds: ['INDIVIDUAL', 'GROUP', 'BROADCAST'],
  sessionId: null,
};
