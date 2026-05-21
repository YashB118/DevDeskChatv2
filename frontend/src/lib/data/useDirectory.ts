import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/lib/http/client';
import { keys } from '@/shared/state/queryKeys';

export const DirectoryUserSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  email: z.string().email().optional(),
  role: z.enum(['ADMIN', 'DEVELOPER']),
  disabled: z.boolean().default(false),
});
export type DirectoryUser = z.infer<typeof DirectoryUserSchema>;

const DirectoryResponseSchema = z.object({
  users: z.array(DirectoryUserSchema),
});

/**
 * Cross-feature read-only directory of workspace users. Backed by the same
 * `/api/users` endpoint the admin feature uses for CRUD, but exposed in
 * `shared/` so any feature can render assignee/mention dropdowns without
 * crossing feature boundaries.
 */
export function useDirectory(): UseQueryResult<{ users: DirectoryUser[] }> {
  return useQuery({
    queryKey: keys.users(),
    queryFn: async () => {
      const res = await apiClient.get<unknown>('/api/admin/users');
      return DirectoryResponseSchema.parse(res.data);
    },
  });
}
