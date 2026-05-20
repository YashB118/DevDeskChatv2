import { z } from 'zod';

export const FeedbackDTOSchema = z.object({
  id: z.string().min(1),
  authorId: z.string().min(1),
  authorName: z.string().min(1),
  message: z.string().min(1),
  ts: z.number().int().nonnegative(),
  read: z.boolean().default(false),
});
export type FeedbackDTO = z.infer<typeof FeedbackDTOSchema>;

export const FeedbackListSchema = z.object({
  items: z.array(FeedbackDTOSchema),
  nextCursor: z.string().nullable(),
});
export type FeedbackList = z.infer<typeof FeedbackListSchema>;
