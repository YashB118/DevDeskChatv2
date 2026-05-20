import { z } from 'zod';

export const CreateSessionSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/, 'name must match /^[A-Za-z0-9_-]+$/'),
  config: z.record(z.unknown()).optional(),
});
export type CreateSessionInput = z.infer<typeof CreateSessionSchema>;

export const SessionNameParamSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);
