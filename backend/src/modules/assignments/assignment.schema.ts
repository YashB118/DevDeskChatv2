import { z } from 'zod';

export const CreateAssignmentSchema = z.object({
  userId: z.string().uuid(),
  chatId: z.string().min(1).max(128),
  wahaSessionId: z.string().uuid().nullish(),
});
export type CreateAssignmentInput = z.infer<typeof CreateAssignmentSchema>;

export const ListAssignmentsQuerySchema = z.object({
  userId: z.string().uuid().optional(),
  chatId: z.string().min(1).max(128).optional(),
  activeOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type ListAssignmentsQuery = z.infer<typeof ListAssignmentsQuerySchema>;
