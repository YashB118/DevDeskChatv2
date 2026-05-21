import { z } from 'zod';

/**
 * Mirrors backend `FeedbackDomain` after JSON serialization. `authorName` is
 * not provided by the backend — frontend derives it from the user directory.
 */
export const FeedbackDTOSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1).nullable(),
  body: z.string(),
  read: z.boolean().default(false),
  createdAt: z.string(),

  // Derived client-side; optional so backend responses parse without them.
  authorName: z.string().optional(),
});
export type FeedbackDTO = z.infer<typeof FeedbackDTOSchema>;

export const FeedbackListSchema = z.object({
  items: z.array(FeedbackDTOSchema),
  nextCursor: z.string().nullable(),
});
export type FeedbackList = z.infer<typeof FeedbackListSchema>;

/** Backend `/api/feedback` list envelope. */
export const FeedbackListResponseSchema = z.object({
  feedback: z.array(FeedbackDTOSchema),
});
