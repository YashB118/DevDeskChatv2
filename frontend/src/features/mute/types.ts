import { z } from 'zod';

export const GlobalMuteSchema = z.object({
  muted: z.boolean(),
});
export type GlobalMute = z.infer<typeof GlobalMuteSchema>;
