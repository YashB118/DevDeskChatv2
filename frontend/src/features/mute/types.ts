import { z } from 'zod';

export const GlobalMuteSchema = z.object({
  enabled: z.boolean(),
});
export type GlobalMute = z.infer<typeof GlobalMuteSchema>;
