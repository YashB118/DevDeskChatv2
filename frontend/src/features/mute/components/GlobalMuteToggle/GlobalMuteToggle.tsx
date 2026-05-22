import type { ReactElement } from 'react';
import { Switch } from '@/design-system/primitives/Switch';
import { Spinner } from '@/design-system/primitives/Spinner';
import { useToast } from '@/design-system/primitives/Toast';
import { AppApiError } from '@/lib/http/errors';
import { useGlobalMute, useGlobalMuteActions } from '../../hooks/useGlobalMute';

export function GlobalMuteToggle(): ReactElement {
  const { data, isLoading } = useGlobalMute();
  const { setEnabled, isPending } = useGlobalMuteActions();
  const { push } = useToast();

  if (isLoading) return <Spinner aria-label="Loading mute state" />;

  const enabled = data?.enabled ?? false;

  const onChange = async (next: boolean): Promise<void> => {
    try {
      await setEnabled(next);
      push({
        title: next ? 'Globally muted' : 'Global mute off',
        description: undefined,
        tone: 'success',
      });
    } catch (err) {
      const msg = AppApiError.isAppApiError(err) ? err.message : 'Failed to update';
      push({ title: 'Failed', description: msg, tone: 'danger' });
    }
  };

  return (
    <div className="flex items-center gap-3 text-[length:var(--text-sm)]">
      <span id="global-mute-label">Global mute (suppress all notifications workspace-wide)</span>
      <Switch
        checked={enabled}
        disabled={isPending}
        aria-labelledby="global-mute-label"
        onCheckedChange={(next) => {
          void onChange(next);
        }}
      />
    </div>
  );
}
