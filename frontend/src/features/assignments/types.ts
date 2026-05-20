import { z } from 'zod';

export const AssignmentDTOSchema = z.object({
  chatId: z.string().min(1),
  chatTitle: z.string(),
  assignedTo: z.string().nullable(),
  assignedToName: z.string().nullable(),
  updatedAt: z.number().int().nonnegative(),
});
export type AssignmentDTO = z.infer<typeof AssignmentDTOSchema>;

export const AssignmentListSchema = z.object({
  items: z.array(AssignmentDTOSchema),
  nextCursor: z.string().nullable(),
});
export type AssignmentList = z.infer<typeof AssignmentListSchema>;
