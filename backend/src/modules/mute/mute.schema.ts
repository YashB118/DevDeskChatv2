import { z } from 'zod';

export const ChatMuteSchema = z.object({
  chatId: z.string().min(1).max(128),
  muted: z.boolean(),
});
export type ChatMuteInput = z.infer<typeof ChatMuteSchema>;

export const GlobalMuteSchema = z.object({
  enabled: z.boolean(),
});
export type GlobalMuteInput = z.infer<typeof GlobalMuteSchema>;
