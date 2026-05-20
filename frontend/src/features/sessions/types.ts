import { z } from 'zod';

export const SessionStatusValues = [
  'STARTING',
  'SCAN_QR_CODE',
  'WORKING',
  'STOPPED',
  'FAILED',
] as const;
export const SessionStatusSchema = z.enum(SessionStatusValues);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionDTOSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: SessionStatusSchema,
  config: z.record(z.unknown()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SessionDTO = z.infer<typeof SessionDTOSchema>;

export const SessionListSchema = z.object({
  sessions: z.array(SessionDTOSchema),
});
export type SessionList = z.infer<typeof SessionListSchema>;

export const SessionQRSchema = z.object({
  mimetype: z.string().min(1),
  data: z.string().min(1),
});
export type SessionQR = z.infer<typeof SessionQRSchema>;

export const CreateSessionInputSchema = z.object({
  name: z
    .string()
    .min(1, 'Name is required')
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/, 'Letters, digits, underscore, hyphen only'),
});
export type CreateSessionInput = z.infer<typeof CreateSessionInputSchema>;
