import { useEffect, useState, type ReactElement } from 'react';
import { Button } from '@/design-system/primitives/Button';
import { Bell, X } from '@/design-system/icons';
import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermissionState,
} from '@/lib/notifications/permission';
import { useSettingsStore } from '@/shared/state/settings';

const DISMISSED_KEY = 'notifications:banner-dismissed';

export function NotificationPermissionBanner(): ReactElement | null {
  const desktopEnabled = useSettingsStore((s) => s.settings.notifications.desktopEnabled);
  const [permission, setPermission] = useState<NotificationPermissionState>(() =>
    getNotificationPermission(),
  );
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(DISMISSED_KEY) === '1';
  });

  useEffect(() => {
    setPermission(getNotificationPermission());
  }, [desktopEnabled]);

  const shouldShow =
    desktopEnabled && permission === 'default' && !dismissed && typeof Notification !== 'undefined';

  if (!shouldShow) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)] px-4 py-2 text-[length:var(--text-sm)]"
    >
      <Bell aria-hidden className="h-4 w-4 text-[var(--color-accent)]" />
      <span className="flex-1">
        Enable desktop notifications so you don&apos;t miss new messages.
      </span>
      <Button
        size="sm"
        onClick={() => {
          void requestNotificationPermission().then((next) => {
            setPermission(next);
          });
        }}
      >
        Allow
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Dismiss"
        onClick={() => {
          if (typeof window !== 'undefined') window.localStorage.setItem(DISMISSED_KEY, '1');
          setDismissed(true);
        }}
      >
        <X aria-hidden className="h-4 w-4" />
      </Button>
    </div>
  );
}
