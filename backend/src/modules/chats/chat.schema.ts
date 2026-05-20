import { z } from 'zod';

export const ListChatsQuerySchema = z.object({
  session: z.string().min(1).max(128),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListChatsQuery = z.infer<typeof ListChatsQuerySchema>;

export const MarkReadParamSchema = z.object({
  chatId: z.string().min(1),
});
