import { type SessionId } from '@app/shared/types/ids';

export const SessionStatusValues = [
  'STARTING',
  'SCAN_QR_CODE',
  'WORKING',
  'STOPPED',
  'FAILED',
] as const;
export type SessionStatus = (typeof SessionStatusValues)[number];

export interface SessionDomain {
  id: SessionId;
  name: string;
  status: SessionStatus;
  config: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}
