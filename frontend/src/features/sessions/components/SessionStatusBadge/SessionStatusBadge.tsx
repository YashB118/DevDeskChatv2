import type { ReactElement } from 'react';
import { Badge } from '@/design-system/primitives/Badge';
import type { SessionStatus } from '../../types';

const TONE: Record<SessionStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  STARTING: 'warning',
  SCAN_QR_CODE: 'warning',
  WORKING: 'success',
  STOPPED: 'neutral',
  FAILED: 'danger',
};

const LABEL: Record<SessionStatus, string> = {
  STARTING: 'Starting…',
  SCAN_QR_CODE: 'Scan QR',
  WORKING: 'Working',
  STOPPED: 'Stopped',
  FAILED: 'Failed',
};

export function SessionStatusBadge({ status }: { status: SessionStatus }): ReactElement {
  return <Badge tone={TONE[status]}>{LABEL[status]}</Badge>;
}
