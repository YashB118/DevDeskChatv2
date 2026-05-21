import { useState, type ReactElement } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { Badge } from '@/design-system/primitives/Badge';
import { Spinner } from '@/design-system/primitives/Spinner';
import { Switch } from '@/design-system/primitives/Switch';
import { EmptyState } from '@/design-system/compounds/EmptyState';
import { SectionHeader } from '@/design-system/compounds/SectionHeader';
import { Plus, Trash2 } from '@/design-system/icons';
import { useToast } from '@/design-system/primitives/Toast';
import { AppApiError } from '@/lib/http/errors';
import { toUserId } from '@/shared/types/ids';
import { useUserActions, useUsers } from '../../hooks/useUsers';
import type { AdminUserDTO } from '../../types';
import { CreateUserDialog } from '../CreateUserDialog/CreateUserDialog';
import { ConfirmDialog } from '@/design-system/compounds/ConfirmDialog';

export function DeveloperManagementPanel(): ReactElement {
  const { data, isLoading, isError } = useUsers();
  const { setDisabled, remove } = useUserActions();
  const { push } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [toDelete, setToDelete] = useState<AdminUserDTO | null>(null);

  const handle = async (label: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
      push({ title: `${label} succeeded`, description: undefined, tone: 'success' });
    } catch (err) {
      const msg = AppApiError.isAppApiError(err) ? err.message : `${label} failed`;
      push({ title: `${label} failed`, description: msg, tone: 'danger' });
    }
  };

  if (isLoading) return <div className="flex justify-center p-12"><Spinner aria-label="Loading users" /></div>;
  if (isError) return <EmptyState title="Failed to load users" />;

  const users = data?.users ?? [];

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title="Developers"
        description="Workspace user accounts. Disable to evict their session."
        action={
          <Button
            leadingIcon={<Plus aria-hidden className="h-4 w-4" />}
            onClick={() => {
              setCreateOpen(true);
            }}
          >
            New developer
          </Button>
        }
      />
      {users.length === 0 ? (
        <EmptyState title="No users" description="Create your first developer." />
      ) : (
        <ul
          aria-label="Users"
          className="flex flex-col divide-y divide-[var(--color-border-subtle)] rounded-[var(--radius-md)] border border-[var(--color-border-subtle)]"
        >
          {users.map((u) => (
            <li key={u.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{u.displayName}</span>
                  <Badge tone={u.role === 'ADMIN' ? 'accent' : 'neutral'}>{u.role}</Badge>
                  {u.disabled && <Badge tone="warning">Disabled</Badge>}
                </div>
                <span className="text-[length:var(--text-sm)] text-[var(--color-fg-muted)]">{u.email}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-[length:var(--text-sm)]">
                  <span id={`enabled-${u.id}`}>Enabled</span>
                  <Switch
                    checked={!u.disabled}
                    onCheckedChange={(next) => {
                      void handle(next ? 'Enable' : 'Disable', () =>
                        setDisabled(toUserId(u.id), !next),
                      );
                    }}
                    aria-labelledby={`enabled-${u.id}`}
                  />
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  leadingIcon={<Trash2 aria-hidden className="h-4 w-4" />}
                  onClick={() => {
                    setToDelete(u);
                  }}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(next) => {
          if (!next) setToDelete(null);
        }}
        title={`Delete ${toDelete?.displayName ?? ''}?`}
        description="The user will lose access immediately and their session will be evicted."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!toDelete) return;
          await handle('Delete', () => remove(toUserId(toDelete.id)));
          setToDelete(null);
        }}
      />
    </div>
  );
}
