import type { ReactElement } from 'react';
import { Spinner } from '@/design-system/primitives/Spinner';
import { EmptyState } from '@/design-system/compounds/EmptyState';
import { QrCode } from '@/design-system/icons';
import { useSessionQR } from '../../hooks/useSessionQR';
import type { SessionStatus } from '../../types';

interface QRPanelProps {
  name: string;
  status: SessionStatus;
}

export function QRPanel({ name, status }: QRPanelProps): ReactElement {
  const enabled = status === 'SCAN_QR_CODE';
  const { data, isLoading, isError } = useSessionQR(name, enabled);

  if (!enabled) {
    return (
      <EmptyState
        icon={<QrCode aria-hidden className="h-6 w-6" />}
        title="No QR needed"
        description={`Session "${name}" is ${status}.`}
      />
    );
  }
  if (isLoading) return <Spinner aria-label="Loading QR" />;
  if (isError || !data) {
    return <EmptyState title="QR unavailable" description="Failed to load QR code." />;
  }

  const src = `data:${data.mimetype};base64,${data.data}`;
  return (
    <div className="flex flex-col items-center gap-2">
      <img
        src={src}
        alt={`QR code for session ${name}`}
        className="h-64 w-64 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-white p-2"
      />
      <p className="text-[length:var(--text-sm)] text-[var(--color-fg-muted)]">
        Scan with WhatsApp on your phone.
      </p>
    </div>
  );
}
