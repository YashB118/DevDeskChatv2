import { z } from 'zod';

/**
 * Mirrors backend `AssignmentDomain` after JSON serialization. `chatTitle` and
 * `assignedToName` are not provided by the backend list endpoint — the
 * frontend derives them from the chat cache and the user directory.
 */
export const AssignmentDTOSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  chatId: z.string().min(1),
  wahaSessionId: z.string().uuid().nullable(),
  assignedBy: z.string().uuid().nullable(),
  assignedAt: z.string(),
  unassignedAt: z.string().nullable(),
  isActive: z.boolean(),

  // Derived client-side; optional so backend responses parse without them.
  chatTitle: z.string().optional(),
  assignedToName: z.string().nullable().optional(),
});
export type AssignmentDTO = z.infer<typeof AssignmentDTOSchema>;

export const AssignmentListSchema = z.object({
  items: z.array(AssignmentDTOSchema),
  nextCursor: z.string().nullable(),
});
export type AssignmentList = z.infer<typeof AssignmentListSchema>;

/** Backend `/api/admin/assignments` list envelope. */
export const AssignmentListResponseSchema = z.object({
  assignments: z.array(AssignmentDTOSchema),
});
