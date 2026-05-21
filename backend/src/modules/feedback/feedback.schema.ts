import { z } from 'zod';

export const SubmitFeedbackSchema = z.object({
  body: z.string().min(1).max(8000),
});
export type SubmitFeedbackInput = z.infer<typeof SubmitFeedbackSchema>;

export const ListFeedbackQuerySchema = z.object({
  unreadOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type ListFeedbackQuery = z.infer<typeof ListFeedbackQuerySchema>;

export const MarkFeedbackSchema = z.object({
  read: z.boolean(),
});
export type MarkFeedbackInput = z.infer<typeof MarkFeedbackSchema>;
