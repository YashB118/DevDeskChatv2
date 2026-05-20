import { useState, type ReactElement } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { Spinner } from '@/design-system/primitives/Spinner';
import { EmptyState } from '@/design-system/compounds/EmptyState';
import { SectionHeader } from '@/design-system/compounds/SectionHeader';
import { Plus, Play, Square, Trash2 } from '@/design-system/icons';
import { useToast } from '@/design-system/primitives/Toast';
import { AppApiError } from '@/lib/http/errors';
import { useSessionMutations, useSessions } from '../../hooks/useSessions';
import type { SessionDTO } from '../../types';
import { SessionStatusBadge } from '../SessionStatusBadge/SessionStatusBadge';
import { QRPanel } from '../QRPanel/QRPanel';
import { CreateSessionDialog } from '../CreateSessionDialog/CreateSessionDialog';
import { ConfirmDialog } from '@/design-system/compounds/ConfirmDialog';

export function SessionsPanel(): ReactElement {
  const { data, isLoading, isError } = useSessions();
  const { start, stop, remove } = useSessionMutations();
  const { push } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<SessionDTO | null>(null);
  const [activeQR, setActiveQR] = useState<SessionDTO | null>(null);

  const handle = async (label: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
      push({ title: `${label} succeeded`, description: undefined, tone: 'success' });
    } catch (err) {
      const msg = AppApiError.isAppApiError(err) ? err.message : `${label} failed`;
      push({ title: `${label} failed`, description: msg, tone: 'danger' });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center p-12">
        <Spinner aria-label="Loading sessions" />
      </div>
    );
  }
  if (isError) {
    return <EmptyState title="Failed to load sessions" description="Try refreshing." />;
  }

  const sessions = data?.sessions ?? [];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="WAHA Sessions"
        description="Create, start, stop, and delete WhatsApp sessions."
        action={
          <Button
            leadingIcon={<Plus aria-hidden className="h-4 w-4" />}
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            New session
          </Button>
        }
      />
      {sessions.length === 0 ? (
        <EmptyState title="No sessions yet" description="Create one to begin." />
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--color-border-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)]">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="font-medium">{s.name}</span>
                <SessionStatusBadge status={s.status} />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  leadingIcon={<Play aria-hidden className="h-4 w-4" />}
                  onClick={() => {
                    void handle('Start', () => start(s.name));
                  }}
                  disabled={s.status === 'WORKING' || s.status === 'STARTING'}
                >
                  Start
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  leadingIcon={<Square aria-hidden className="h-4 w-4" />}
                  onClick={() => {
                    void handle('Stop', () => stop(s.name));
                  }}
                  disabled={s.status === 'STOPPED'}
                >
                  Stop
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setActiveQR(s);
                  }}
                  disabled={s.status !== 'SCAN_QR_CODE'}
                >
                  Show QR
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  leadingIcon={<Trash2 aria-hidden className="h-4 w-4" />}
                  onClick={() => {
                    setToDelete(s);
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {activeQR && (
        <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-4">
          <SectionHeader
            title={`QR — ${activeQR.name}`}
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setActiveQR(null);
                }}
              >
                Close
              </Button>
            }
          />
          <QRPanel name={activeQR.name} status={activeQR.status} />
        </div>
      )}

      <CreateSessionDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(next) => {
          if (!next) setToDelete(null);
        }}
        title={`Delete session "${toDelete?.name ?? ''}"?`}
        description="This stops the session and removes its data. Cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!toDelete) return;
          await handle('Delete', () => remove(toDelete.name));
          setToDelete(null);
        }}
      />
    </div>
  );
}
